'use strict';

/**
 * Application-wide constants.
 * Named constants rather than magic numbers — per SKILL.md §8 on the fuzzy-match threshold.
 */

const REFERENCE_NUMBER = {
  // Default pattern for reference number validation.
  // Format: {COMPANY}/{SERIES}/{POSTING_CODE}/{SEQUENCE}
  // This is posting-series-aware and NOT hardcoded to IHM/JA per SKILL.md §5.
  DEFAULT_PATTERN: /^([A-Z]{2,10})\/([A-Z]{2,10})\/(\d{1,10})\/(\d{1,10})$/,

  // Known series configurations — extensible without code changes
  KNOWN_SERIES: {
    'IHM/JA': {
      companyPrefix: 'IHM',
      seriesMarker: 'JA',
      description: 'IHM Job Application',
    },
  },
};

const AUTH = {
  SALT_ROUNDS: 12,
  TOKEN_TYPES: {
    ACCESS: 'access',
    REFRESH: 'refresh',
  },
  COOKIE_NAME: 'refresh_token',
};

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

const FILE_UPLOAD = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_EXCEL_TYPES: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
  ],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'image/jpeg',
    'image/png',
  ],
};

const VERDICT = {
  ELIGIBLE: 'eligible',
  SEMI_ELIGIBLE: 'semi_eligible',
  NOT_ELIGIBLE: 'not_eligible',
};

const APPLICATION_STATUS = {
  PENDING: 'PENDING',
  VALIDATING: 'VALIDATING',
  VALIDATED: 'VALIDATED',
  PARSING: 'PARSING',
  PARSED: 'PARSED',
  EVALUATING: 'EVALUATING',
  EVALUATED: 'EVALUATED',
  FAILED_VALIDATION: 'FAILED_VALIDATION',
  FAILED_PARSING: 'FAILED_PARSING',
  FAILED_EVALUATION: 'FAILED_EVALUATION',
};

const USER_ROLES = {
  ADMIN: 'ADMIN',
  RECRUITER: 'RECRUITER',
  HIRING_MANAGER: 'HIRING_MANAGER',
};

/**
 * Fuzzy-match similarity threshold for citation text verification.
 *
 * WHY 0.85: This is a tuning decision (per SKILL.md §8 and PRD v3 open questions).
 * A threshold of 0.85 balances between catching legitimate minor OCR/formatting
 * differences and rejecting genuinely wrong citations. This is a named constant,
 * not a magic number — if this value needs adjustment, change it here and
 * document the reason.
 *
 * This default can be overridden via the FUZZY_MATCH_THRESHOLD environment variable.
 */
const CITATION_VERIFICATION = {
  DEFAULT_FUZZY_THRESHOLD: 0.85,
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

module.exports = {
  REFERENCE_NUMBER,
  AUTH,
  PAGINATION,
  FILE_UPLOAD,
  VERDICT,
  APPLICATION_STATUS,
  USER_ROLES,
  CITATION_VERIFICATION,
  HTTP_STATUS,
};
