'use strict';

const { prisma } = require('../lib/prisma');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const { logAuditEvent } = require('../middleware/auditLogger');
const { parseExcelBuffer } = require('../services/excelImport');
const storage = require('../services/storage');
const { extractFromFilename, parse: parseReferenceNumber } = require('../services/referenceNumber');

function detectDocumentType(fileName, mimeType) {
  const normalizedName = (fileName || '').toLowerCase();
  const normalizedMimeType = (mimeType || '').toLowerCase();

  if (normalizedName.includes('application') || normalizedName.includes('form')) return 'APPLICATION_FORM';
  if (normalizedName.includes('resume') || normalizedName.includes('cv')) return 'RESUME';
  if (normalizedName.includes('aadhaar') || normalizedName.includes('passport') || normalizedName.includes('pan')) return 'IDENTITY_PROOF';
  if (normalizedName.includes('degree') || normalizedName.includes('marksheet') || normalizedName.includes('certificate')) return 'ACADEMIC_DOCUMENT';
  if (normalizedMimeType === 'application/pdf') return 'APPLICATION_FORM';

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
    if (!job) throw new NotFoundError('Job', jobId);

    const where = { jobId };
    if (status) where.status = status;

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

    if (!application) throw new NotFoundError('Application', applicationId);

    res.json({ application });
  } catch (error) {
    next(error);
  }
}

async function importFromExcel(req, res, next) {
  try {
    const { jobId } = req.params;
    if (!req.file) throw new ValidationError('Excel file is required');

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('Job', jobId);

    const buffer = req.file.buffer;
    const fileName = req.file.originalname;

    const { rows, failedRows, warnings, totalRows } = await parseExcelBuffer(buffer, job.postingCode);
    if (totalRows === 0) throw new ValidationError('Excel file contains no data rows');

    const excelKey = storage.generateKey('application', job.postingCode, `imports/${fileName}`);
    await storage.upload(excelKey, buffer, req.file.mimetype);

    const importBatch = await prisma.importBatch.create({
      data: { jobId, fileName, totalRows, processedRows: 0, failedRows: failedRows.length, status: 'PROCESSING', createdBy: req.user.id },
    });

    let processedCount = 0;
    const duplicates = [];
    const created = [];

    for (const row of rows) {
      const existing = await prisma.application.findUnique({ where: { referenceNumber: row.referenceNumber } });
      if (existing) {
        duplicates.push({
          rowNumber: row.rowNumber,
          referenceNumber: row.referenceNumber,
          errorType: 'DUPLICATE',
          errorMessage: `Application with reference '${row.referenceNumber}' already exists`,
          rawRowData: row.rawRowData,
        });
        continue;
      }

      const application = await prisma.application.create({
        data: {
          jobId,
          referenceNumber: row.referenceNumber,
          referenceValidated: true,
          candidateName: row.candidateName,
          candidateEmail: row.candidateEmail,
          status: 'PENDING',
          importBatchId: importBatch.id,
        },
      });

      created.push(application);
      processedCount++;
    }

    const allFailures = [...failedRows, ...duplicates];
    if (allFailures.length > 0) {
      await prisma.failedImport.createMany({
        data: allFailures.map((f) => ({
          importBatchId: importBatch.id,
          rowNumber: f.rowNumber,
          referenceNumber: f.referenceNumber,
          errorType: f.errorType,
          errorMessage: f.errorMessage,
          rawRowData: f.rawRowData || null,
        })),
      });
    }

    const batchStatus = allFailures.length === 0 ? 'COMPLETED' : processedCount === 0 ? 'FAILED' : 'COMPLETED_WITH_ERRORS';

    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: { processedRows: processedCount, failedRows: allFailures.length, status: batchStatus, completedAt: new Date() },
    });

    logAuditEvent('EXCEL_IMPORT', {
      jobId,
      importBatchId: importBatch.id,
      totalRows,
      processedRows: processedCount,
      failedRows: allFailures.length,
      duplicates: duplicates.length,
      importedBy: req.user.id,
    });

    logger.info({ jobId, importBatchId: importBatch.id, totalRows, processed: processedCount, failed: allFailures.length }, 'Excel import completed');

    res.status(201).json({
      importBatch: { id: importBatch.id, status: batchStatus, totalRows, processedRows: processedCount, failedRows: allFailures.length, duplicates: duplicates.length },
      warnings,
      created: created.map((a) => ({ id: a.id, referenceNumber: a.referenceNumber })),
      failures: allFailures.map((f) => ({ rowNumber: f.rowNumber, referenceNumber: f.referenceNumber, errorType: f.errorType, errorMessage: f.errorMessage })),
    });
  } catch (error) {
    next(error);
  }
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

    if (!batch) throw new NotFoundError('Import batch', batchId);

    res.json({ batch });
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

    if (!application) throw new NotFoundError('Application', applicationId);

    const currentResult = application.matchResults[0];
    if (!currentResult) throw new ValidationError('Application has no AI match result to override');

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
    if (!req.file) throw new ValidationError('ZIP file is required');

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('Job', jobId);

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
    if (!application) throw new NotFoundError('Application', applicationId);
    if (!application.job.checklistLocked) throw new ValidationError('Cannot evaluate application: Job checklist is not locked');

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
  overrideVerdict,
  importZip,
  evaluateApplication,
};
