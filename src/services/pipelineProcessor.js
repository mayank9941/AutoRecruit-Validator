'use strict';

const { prisma } = require('../lib/prisma');
const aiService = require('./aiService');
const { logger } = require('../utils/logger');
const { logAuditEvent } = require('../middleware/auditLogger');

/**
 * AI Candidate Evaluation Pipeline Processor.
 *
 * Orchestrates Phase 4, 5, and 6:
 * 1. Parse structured form
 * 2. Check rules and verify citations
 * 3. Compute deterministic verdict
 */

async function processApplication(applicationId) {
  logger.info({ applicationId }, 'Starting AI candidate evaluation pipeline');

  try {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        documents: true,
      },
    });

    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (application.status === 'EVALUATED') {
      logger.info({ applicationId }, 'Application already evaluated, skipping');
      return;
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'PARSING' },
    });

    const formDocument = application.documents.find(
      (doc) => doc.fileType === 'APPLICATION_FORM' || doc.mimeType === 'application/pdf'
    );

    let parsedFormData = null;
    let attachmentManifest = {
      attachments: application.documents.map((doc) => ({
        file_name: doc.fileName,
        storage_key: doc.s3Key,
        mime_type: doc.mimeType,
      })),
    };

    if (formDocument) {
      const parseResult = await aiService.parseFormPdf(
        formDocument.s3Key,
        application.referenceNumber
      );
      parsedFormData = parseResult.parsed_form_data;
      attachmentManifest = parseResult.attachment_manifest || attachmentManifest;

      await prisma.application.update({
        where: { id: applicationId },
        data: {
          parsedFormData,
          attachmentManifest,
          status: 'PARSED',
        },
      });
    } else {
      logger.warn({ applicationId }, 'No application form PDF found for candidate');
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'EVALUATING' },
    });

    if (!application.job.checklistLocked) {
      throw new Error(`Cannot evaluate application ${applicationId}: Job checklist is not locked`);
    }

    const rules = Array.isArray(application.job.requirements) ? application.job.requirements : [];

    const checkResult = await aiService.checkRules({
      parsedFormData: parsedFormData || {},
      checklistRules: rules,
      attachmentManifest,
      applicationId,
    });

    const verdictResult = await aiService.computeVerdict(checkResult.rule_results);

    await prisma.aiMatchResult.create({
      data: {
        applicationId,
        verdict: verdictResult.verdict,
        ruleResults: verdictResult.rule_results,
        checklistVersion: application.job.checklistVersion || 1,
      },
    });

    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'EVALUATED' },
    });

    logAuditEvent('APPLICATION_EVALUATED', {
      applicationId,
      jobId: application.jobId,
      verdict: verdictResult.verdict,
    });

    logger.info(
      { applicationId, verdict: verdictResult.verdict },
      'AI Candidate Evaluation completed successfully'
    );
  } catch (error) {
    logger.error({ applicationId, error: error.message }, 'Pipeline processing failed');

    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED_EVALUATION', processingError: error.message },
    });

    throw error;
  }
}

module.exports = {
  processApplication,
};
