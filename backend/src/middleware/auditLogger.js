'use strict';

/**
 * Audit logging middleware.
 *
 * Per SKILL.md §9 and NFR-06: "100% of document views, verdicts, and overrides logged, append-only."
 * Per SKILL.md §10: structured logging with PII redaction.
 *
 * This middleware logs:
 * - Request details (method, URL, user, role)
 * - Response status and timing
 * - Authentication events
 * - Override events
 *
 * PII is redacted before logging — never log candidate names, emails, phone numbers, or Aadhaar numbers.
 */

const { logger } = require('../utils/logger');

function auditLoggerMiddleware(req, res, next) {
  const startTime = Date.now();

  // Capture original end to log after response is sent
  const originalEnd = res.end;

  res.end = function (...args) {
    const duration = Date.now() - startTime;

    const auditEntry = {
      type: 'request',
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // Log at different levels based on status code
    if (res.statusCode >= 500) {
      logger.error(auditEntry, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(auditEntry, 'Request completed with client error');
    } else {
      logger.info(auditEntry, 'Request completed');
    }

    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Log a specific audit event (override, document view, verdict, etc.)
 * This is called explicitly from controllers, not as middleware.
 */
function logAuditEvent(eventType, details) {
  logger.info(
    {
      type: 'audit',
      eventType,
      ...details,
      timestamp: new Date().toISOString(),
    },
    `Audit: ${eventType}`
  );
}

module.exports = { auditLoggerMiddleware, logAuditEvent };
