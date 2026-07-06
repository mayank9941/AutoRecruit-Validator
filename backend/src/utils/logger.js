'use strict';

const pino = require('pino');
const { redactPii } = require('./piiRedactor');

/**
 * Structured logging with Pino.
 *
 * PII redaction is applied via custom serializers per SKILL.md §10:
 * "Never log or print full candidate PII (name, email, phone, Aadhaar number)
 * in plain console logs — use structured logging with PII redaction."
 */

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.id,
      // Redact any PII from query/body if present in req
      query: req.query ? redactPii(req.query) : undefined,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
    // Custom serializer for candidate data — always redact PII
    candidate: (candidate) => redactPii(candidate),
    user: (user) => ({
      id: user.id,
      role: user.role,
      // Never log email in production
      ...(isProduction ? {} : { email: user.email }),
    }),
  },
  // Base fields included in every log line
  base: {
    service: 'recruitment-backend',
    ...(isProduction ? {} : { pid: process.pid }),
  },
});

/**
 * Create a child logger with a request correlation ID.
 * Used by the requestId middleware to carry the correlation ID through the request lifecycle.
 */
function createRequestLogger(requestId) {
  return logger.child({ requestId });
}

module.exports = { logger, createRequestLogger };
