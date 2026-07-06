'use strict';

const { prisma } = require('../lib/prisma');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const { logAuditEvent } = require('../middleware/auditLogger');
const { parseExcelStream } = require('../services/excelImport');
const storage = require('../services/storage');
const { extractFromFilename, parse: parseReferenceNumber, validateConsistency } = require('../services/referenceNumber');
const pLimit = require('p-limit');
const axios = require('axios');

function detectDocumentType(fileName, mimeType) {
  const normalizedName = (fileName || '').toLowerCase();
  const normalizedMimeType = (mimeType || '').toLowerCase();

  if (normalizedName.includes('application') || normalizedName.includes('form')) {return 'APPLICATION_FORM';}
  if (normalizedName.includes('resume') || normalizedName.includes('cv')) {return 'RESUME';}
  if (normalizedName.includes('aadhaar') || normalizedName.includes('passport') || normalizedName.includes('pan')) {return 'IDENTITY_PROOF';}
  if (normalizedName.includes('degree') || normalizedName.includes('marksheet') || normalizedName.includes('certificate')) {return 'ACADEMIC_DOCUMENT';}
  if (normalizedMimeType === 'application/pdf') {return 'APPLICATION_FORM';}

  return 'SUPPORTING_DOCUMENT';
}

function extractReferenceNumberFromZipPath(filePath, archiveName = null) {
  const candidates = [];

  if (filePath) {
    candidates.push(
      ...filePath
        .split(/[\\/]+/)
        .map((segment) => segment.trim())
        .filter(Boolean)
    );
  }

  if (archiveName) {
    candidates.push(archiveName.trim());
  }

  for (const segment of candidates) {
    const referenceNumber = extractFromFilename(segment.toUpperCase());
    if (referenceNumber) {
      return referenceNumber;
    }
  }

  return null;
}

async function listApplications(req, res, next) {
  try {
    const { jobId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const verdict = req.query.verdict;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {throw new NotFoundError('Job', jobId);}

    const where = { jobId };
    if (status) {where.status = status;}

    const include = {
      matchResults: verdict
        ? { where: { verdict }, orderBy: { createdAt: 'desc' }, take: 1 }
        : { orderBy: { createdAt: 'desc' }, take: 1 },
      documents: true,
    };

    const [applications, total] = await Promise.all([
      prisma.application.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include }),
      prisma.application.count({ where }),
    ]);

    const filteredApps = verdict ? applications.filter((app) => app.matchResults.length > 0) : applications;

    res.json({
      applications: filteredApps,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

async function getApplication(req, res, next) {
  try {
    const { applicationId } = req.params;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { select: { id: true, title: true, postingCode: true } },
        matchResults: { orderBy: { createdAt: 'desc' } },
        documents: true,
      },
    });

    if (!application) {throw new NotFoundError('Application', applicationId);}

    res.json({ application });
  } catch (error) {
    next(error);
  }
}

async function importFromExcel(req, res, next) {
  try {
    const { jobId } = req.params;
    if (!req.file) {throw new ValidationError('Excel file is required');}

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {throw new NotFoundError('Job', jobId);}

    const buffer = req.file.buffer;
    const fileName = req.file.originalname;

    const { rows, failedRows, warnings, totalRows } = await parseExcelStream(buffer, job.postingCode);
    if (totalRows === 0) {throw new ValidationError('Excel file contains no data rows');}

    const rowStatuses = rows.map((r) => ({
      rowIndex: r.rowNumber,
      referenceNumber: r.referenceNumber,
      status: 'queued',
    }));

    const importBatch = await prisma.importBatch.create({
      data: {
        jobId,
        fileName,
        totalRows,
        processedRows: 0,
        failedRows: 0,
        rowStatuses,
        status: 'PROCESSING',
        createdBy: req.user.id,
      },
    });

    const excelKey = storage.generateKey('application', job.postingCode, `imports/${fileName}`);
    await storage.upload(excelKey, buffer, req.file.mimetype);

    const limit = pLimit(4);
    const batchId = importBatch.id;

    const rowTasks = rows.map((row) =>
      limit(() => processCandidateRow(job, batchId, row).then((app) => ({ row, application: app })))
    );

    const results = await Promise.allSettled(rowTasks);
    const created = [];
    const failuresList = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const row = rows[i];

      if (result.status === 'fulfilled') {
        created.push({ id: result.value.application.id, referenceNumber: row.referenceNumber });
      } else {
        failuresList.push({
          rowNumber: row.rowNumber,
          referenceNumber: row.referenceNumber,
          errorType: 'PROCESSING_FAILED',
          errorMessage: result.reason?.message || 'Unknown error',
          rawRowData: row.rawRowData,
        });
      }
    }

    const allFailures = [...failedRows, ...failuresList];

    if (allFailures.length > 0) {
      await prisma.failedImport.createMany({
        data: allFailures.map((f) => ({
          importBatchId: batchId,
          rowNumber: f.rowNumber,
          referenceNumber: f.referenceNumber,
          errorType: f.errorType,
          errorMessage: f.errorMessage,
          rawRowData: f.rawRowData || null,
        })),
      });
    }

    const processedCount = created.length;
    const failedCount = allFailures.length;
    const batchStatus = failedCount === 0 ? 'COMPLETED' : processedCount === 0 ? 'FAILED' : 'COMPLETED_WITH_ERRORS';

    const finalRowStatuses = rows.map((row) => {
      const createdApp = created.find((c) => c.referenceNumber === row.referenceNumber);
      const failed = allFailures.find((f) => f.rowNumber === row.rowNumber);
      if (createdApp) {return { rowIndex: row.rowNumber, referenceNumber: row.referenceNumber, status: 'success' };}
      if (failed) {return { rowIndex: row.rowNumber, referenceNumber: row.referenceNumber, status: 'failed', error: failed.errorMessage };}
      return { rowIndex: row.rowNumber, referenceNumber: row.referenceNumber, status: 'failed', error: 'Unknown error' };
    });

    await prisma.importBatch.update({
      where: { id: batchId },
      data: { processedRows: processedCount, failedRows: failedCount, rowStatuses: finalRowStatuses, status: batchStatus, completedAt: new Date() },
    });

    logAuditEvent('EXCEL_IMPORT', {
      jobId,
      importBatchId: batchId,
      totalRows,
      processedRows: processedCount,
      failedRows: failedCount,
      importedBy: req.user.id,
    });

    logger.info({ jobId, importBatchId: batchId, totalRows, processed: processedCount, failed: failedCount }, 'Excel import completed');

    res.status(201).json({
      importBatch: { id: batchId, status: batchStatus, totalRows, processedRows: processedCount, failedRows: failedCount },
      warnings,
      rows: finalRowStatuses,
      created: created.map((a) => ({ id: a.id, referenceNumber: a.referenceNumber })),
      failures: allFailures.map((f) => ({ rowNumber: f.rowNumber, referenceNumber: f.referenceNumber, errorType: f.errorType, errorMessage: f.errorMessage })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Process a single candidate row from the Excel import.
 *
 * Pipeline per SKILL.md §5 and §7:
 * 1. Validate reference number format (Phase 1 validator)
 * 2. Download ZIP and PDF files from their links, stream directly to S3
 * 3. Three-source reference-number consistency check (filename vs Excel row vs PDF filename)
 * 4. On success: create Application + Document records
 * 5. On failure: throw — caught by Promise.allSettled in the caller
 */
async function processCandidateRow(job, batchId, row) {
  const { referenceNumber, zipLink, pdfLink } = row;

  const parsed = parseReferenceNumber(referenceNumber);
  if (parsed.postingCode !== job.postingCode) {
    throw new Error(`Posting code mismatch: row '${parsed.postingCode}' vs job '${job.postingCode}'`);
  }

  const existing = await prisma.application.findUnique({ where: { referenceNumber } });
  if (existing) {
    throw new Error(`Duplicate reference number '${referenceNumber}'`);
  }

  let zipUploadResult = null;
  let pdfUploadResult = null;
  const zipFilenameRef = zipLink ? extractFromFilename(zipLink) : null;
  const pdfFilenameRef = pdfLink ? extractFromFilename(pdfLink) : null;

  if (zipLink) {
    const zipStream = await downloadFileAsStream(zipLink);
    const zipKey = storage.generateKey('document', job.postingCode, `candidates/${referenceNumber}/${extractUrlFilename(zipLink)}`);
    zipUploadResult = await storage.upload(zipKey, zipStream, 'application/zip');
  }

  if (pdfLink) {
    const pdfStream = await downloadFileAsStream(pdfLink);
    const pdfKey = storage.generateKey('document', job.postingCode, `candidates/${referenceNumber}/${extractUrlFilename(pdfLink)}`);
    pdfUploadResult = await storage.upload(pdfKey, pdfStream, 'application/pdf');
  }

  const consistency = validateConsistency(referenceNumber, zipFilenameRef, pdfFilenameRef);
  if (!consistency.valid) {
    const msg = consistency.details?.error || `Reference mismatch: ${consistency.mismatches.join(', ')}`;
    throw new Error(msg);
  }

  const application = await prisma.application.create({
    data: {
      jobId: job.id,
      referenceNumber,
      referenceValidated: true,
      status: 'PENDING',
      importBatchId: batchId,
    },
  });

  if (zipUploadResult) {
    await prisma.document.create({
      data: {
        applicationId: application.id,
        fileName: extractUrlFilename(zipLink),
        fileType: 'SUPPORTING_DOCUMENT',
        s3Key: zipUploadResult.key,
        s3Bucket: zipUploadResult.bucket,
        mimeType: 'application/zip',
      },
    });
  }

  if (pdfUploadResult) {
    await prisma.document.create({
      data: {
        applicationId: application.id,
        fileName: extractUrlFilename(pdfLink),
        fileType: 'APPLICATION_FORM',
        s3Key: pdfUploadResult.key,
        s3Bucket: pdfUploadResult.bucket,
        mimeType: 'application/pdf',
      },
    });
  }

  logger.info({ referenceNumber, jobId: job.id }, 'Candidate row processed successfully');
  return application;
}

async function downloadFileAsStream(url) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 60000,
    maxRedirects: 5,
  });
  return response.data;
}

function extractUrlFilename(url) {
  const urlPath = new URL(url).pathname;
  const segments = urlPath.split('/').filter(Boolean);
  return segments[segments.length - 1] || `file-${Date.now()}`;
}

async function getImportBatch(req, res, next) {
  try {
    const { batchId } = req.params;

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        failedImports: true,
        job: { select: { id: true, title: true, postingCode: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!batch) {throw new NotFoundError('Import batch', batchId);}

    res.json({ batch });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/jobs/:jobId/imports/:batchId/status
 *
 * Returns per-row progress for the frontend polling endpoint.
 * Derives status from ImportBatch.rowStatuses JSONB and FailedImport records.
 */
async function getImportStatus(req, res, next) {
  try {
    const { jobId, batchId } = req.params;

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        failedImports: {
          select: { rowNumber: true, referenceNumber: true, errorType: true, errorMessage: true },
        },
      },
    });

    if (!batch) {throw new NotFoundError('Import batch', batchId);}
    if (batch.jobId !== jobId) {throw new NotFoundError('Import batch for this job', batchId);}

    const rows = (batch.rowStatuses || []).map((rs) => {
      const failed = batch.failedImports.find((f) => f.rowNumber === rs.rowIndex);
      return {
        rowIndex: rs.rowIndex,
        referenceNumber: rs.referenceNumber,
        status: rs.status,
        ...(failed ? { error: failed.errorMessage } : {}),
      };
    });

    res.json({
      importBatch: {
        id: batch.id,
        status: batch.status,
        totalRows: batch.totalRows,
        processedRows: batch.processedRows,
        failedRows: batch.failedRows,
        completedAt: batch.completedAt,
        createdAt: batch.createdAt,
      },
      rows,
    });
  } catch (error) {
    next(error);
  }
}

async function overrideVerdict(req, res, next) {
  try {
    const { applicationId } = req.params;
    const { verdict, reason } = req.body;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { matchResults: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!application) {throw new NotFoundError('Application', applicationId);}

    const currentResult = application.matchResults[0];
    if (!currentResult) {throw new ValidationError('Application has no AI match result to override');}

    const previousVerdict = currentResult.verdict;

    const updatedResult = await prisma.aiMatchResult.update({
      where: { id: currentResult.id },
      data: { verdict, overrideBy: req.user.id, overrideReason: reason, overrideAt: new Date() },
    });

    await prisma.overrideHistory.create({
      data: { matchResultId: currentResult.id, overriddenBy: req.user.id, previousVerdict, newVerdict: verdict, reason },
    });

    logAuditEvent('VERDICT_OVERRIDDEN', { applicationId, matchResultId: currentResult.id, previousVerdict, newVerdict: verdict, overriddenBy: req.user.id });
    logger.info({ applicationId, previousVerdict, newVerdict: verdict, overriddenBy: req.user.id }, 'Verdict overridden');

    res.json({ matchResult: updatedResult, previousVerdict });
  } catch (error) {
    next(error);
  }
}

const { processZipImport } = require('../services/zipImport');
const stream = require('stream');

async function importZip(req, res, next) {
  try {
    const { jobId } = req.params;
    if (!req.file) {throw new ValidationError('ZIP file is required');}

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {throw new NotFoundError('Job', jobId);}

    const zipStream = new stream.Readable();
    zipStream.push(req.file.buffer);
    zipStream.push(null);

    const result = await processZipImport(zipStream, jobId, job.postingCode, req.file.originalname);

    const createdApplications = [];
    const linkedDocuments = [];
    const skippedFiles = [];

    for (const file of result.uploadedFiles) {
      const referenceNumber = extractReferenceNumberFromZipPath(file.originalPath, file.archiveName);

      if (!referenceNumber) {
        skippedFiles.push({ originalPath: file.originalPath, reason: 'No reference number found in ZIP path or archive name' });
        continue;
      }

      const parsedReference = parseReferenceNumber(referenceNumber);
      if (parsedReference.postingCode !== job.postingCode) {
        skippedFiles.push({ originalPath: file.originalPath, reason: `Posting code ${parsedReference.postingCode} does not match job ${job.postingCode}` });
        continue;
      }

      let application = await prisma.application.findUnique({ where: { referenceNumber } });
      if (!application) {
        application = await prisma.application.create({
          data: { jobId, referenceNumber, referenceValidated: true, candidateName: referenceNumber, status: 'PENDING' },
        });
        createdApplications.push({ id: application.id, referenceNumber: application.referenceNumber });
      }

      const existingDocument = await prisma.document.findFirst({ where: { applicationId: application.id, s3Key: file.storageKey } });
      if (!existingDocument) {
        const document = await prisma.document.create({
          data: {
            applicationId: application.id,
            fileName: file.originalPath.split(/[\\/]+/).pop() || file.originalPath,
            fileType: detectDocumentType(file.originalPath, file.mimeType),
            s3Key: file.storageKey,
            s3Bucket: file.storageBucket || 'local',
            fileSizeBytes: file.size,
            mimeType: file.mimeType,
            pageCount: 1,
          },
        });
        linkedDocuments.push({ id: document.id, applicationId: application.id, referenceNumber, fileName: document.fileName });
      }
    }

    logAuditEvent('ZIP_IMPORT', {
      jobId,
      totalExtracted: result.totalExtracted,
      uploadedCount: result.uploadedFiles.length,
      failedCount: result.failedFiles.length,
      createdApplications: createdApplications.length,
      linkedDocuments: linkedDocuments.length,
      skippedFiles: skippedFiles.length,
      importedBy: req.user.id,
    });

    res.status(201).json({ message: 'ZIP processing complete', ...result, createdApplications, linkedDocuments, skippedFiles });
  } catch (error) {
    next(error);
  }
}

const { processApplication } = require('../services/pipelineProcessor');

async function evaluateApplication(req, res, next) {
  try {
    const { applicationId } = req.params;

    const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { job: true } });
    if (!application) {throw new NotFoundError('Application', applicationId);}
    if (!application.job.checklistLocked) {throw new ValidationError('Cannot evaluate application: Job checklist is not locked');}

    processApplication(applicationId).catch((err) => {
      logger.error({ applicationId, error: err.message }, 'Background pipeline processing failed');
    });

    res.status(202).json({ message: 'Evaluation pipeline triggered successfully', applicationId, status: 'PROCESSING' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listApplications,
  getApplication,
  importFromExcel,
  getImportBatch,
  getImportStatus,
  overrideVerdict,
  importZip,
  evaluateApplication,
};
