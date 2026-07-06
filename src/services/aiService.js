'use strict';

const axios = require('axios');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * AI Service Connector.
 *
 * Per SKILL.md §3: Backend calls the Python AI service over HTTP.
 * Per SKILL.md §11: No direct imports between services.
 *
 * All communication with the AI service goes through this module.
 */

const client = axios.create({
  baseURL: config.AI_SERVICE_URL,
  timeout: config.AI_SERVICE_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for correlation ID propagation
client.interceptors.request.use((requestConfig) => {
  // Propagate request ID if available (set by requestId middleware)
  if (requestConfig.headers && !requestConfig.headers['X-Request-ID']) {
    requestConfig.headers['X-Request-ID'] = `ai-${Date.now()}`;
  }
  return requestConfig;
});

// Response interceptor for error handling
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      logger.error(
        {
          status: error.response.status,
          url: error.config?.url,
          data: error.response.data,
        },
        'AI service request failed'
      );
      throw new AppError(
        `AI service error: ${error.response.data?.error?.message || error.message}`,
        error.response.status >= 500 ? 502 : error.response.status,
        'AI_SERVICE_ERROR'
      );
    }
    if (error.code === 'ECONNREFUSED') {
      logger.error('AI service is not available');
      throw new AppError('AI service is not available', 503, 'AI_SERVICE_UNAVAILABLE');
    }
    throw new AppError(`AI service connection error: ${error.message}`, 502, 'AI_SERVICE_ERROR');
  }
);

/**
 * Extract checklist rules from a job notice.
 *
 * Per SKILL.md §2: LLM's role is limited to extracting the eligibility checklist.
 *
 * @param {string} noticeText - Full text of the job notice
 * @param {string} jobId - Job ID for context
 * @returns {Promise<{ rules: Object[], confidence: number, warnings: string[] }>}
 */
async function extractChecklist(noticeText, jobId) {
  logger.info({ jobId, textLength: noticeText.length }, 'Requesting checklist extraction');

  const response = await client.post('/api/extract-checklist', {
    job_notice_text: noticeText,
    job_id: jobId,
  });

  return response.data;
}

/**
 * Parse a structured application form PDF.
 *
 * Per SKILL.md §6: Deterministic table extraction, not LLM reading.
 *
 * @param {string} pdfS3Key - S3 key of the form PDF
 * @param {string} referenceNumber - Expected reference number
 * @returns {Promise<{ parsed_form_data: Object, attachment_manifest: Object }>}
 */
async function parseFormPdf(pdfS3Key, referenceNumber) {
  logger.info({ pdfS3Key, referenceNumber }, 'Requesting form PDF parsing');

  const response = await client.post('/api/parse-form', {
    pdf_s3_key: pdfS3Key,
    reference_number: referenceNumber,
  });

  return response.data;
}

/**
 * Run rule checking against a candidate's declared values and evidence.
 *
 * Per SKILL.md §2: The LLM finds and cites evidence for rules requiring documentary proof.
 *
 * @param {Object} params
 * @param {Object} params.parsedFormData - Parsed form data
 * @param {Object[]} params.checklistRules - Locked checklist rules
 * @param {Object} params.attachmentManifest - Available documents
 * @param {string} params.applicationId - Application ID for correlation
 * @returns {Promise<{ rule_results: Object[] }>}
 */
async function checkRules({ parsedFormData, checklistRules, attachmentManifest, applicationId }) {
  logger.info({ applicationId, ruleCount: checklistRules.length }, 'Requesting rule checking');

  const response = await client.post('/api/check-rules', {
    parsed_form_data: parsedFormData,
    checklist_rules: checklistRules,
    attachment_manifest: attachmentManifest,
    application_id: applicationId,
  });

  return response.data;
}

/**
 * Compute verdict from rule results.
 *
 * Per SKILL.md §2: The verdict computation is a pure, deterministic function.
 *
 * @param {Object[]} ruleResults - Array of rule check results
 * @returns {Promise<{ verdict: string, rule_results: Object[], summary: Object }>}
 */
async function computeVerdict(ruleResults) {
  logger.info({ ruleCount: ruleResults.length }, 'Requesting verdict computation');

  const response = await client.post('/api/compute-verdict', {
    rule_results: ruleResults,
  });

  return response.data;
}

/**
 * Check AI service health.
 */
async function healthCheck() {
  try {
    const response = await client.get('/health', { timeout: 5000 });
    return response.data;
  } catch {
    return { status: 'unhealthy' };
  }
}

module.exports = {
  extractChecklist,
  parseFormPdf,
  checkRules,
  computeVerdict,
  healthCheck,
};
