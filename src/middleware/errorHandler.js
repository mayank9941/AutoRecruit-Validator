'use strict';

const { logger } = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Global error handler middleware.
 *
 * Per the master prompt: "Never expose stack traces" and "Invalid requests return structured JSON errors."
 * Operational errors (AppError descendants) return their structured response.
 * Unexpected errors are logged and return a generic 500.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Prisma known request errors (e.g. unique constraint violation)
  if (err.code === 'P2002') {
    const target = err.meta?.target;
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: `A record with this ${target ? target.join(', ') : 'value'} already exists`,
      },
    });
  }

  // Prisma not found errors
  if (err.code === 'P2025') {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: err.meta?.cause || 'Record not found',
      },
    });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the maximum allowed size',
      },
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: {
        code: 'UNEXPECTED_FILE',
        message: 'Unexpected file field',
      },
    });
  }

  // Multer file filter rejections (e.g. wrong file type)
  if (err.message && (err.message.startsWith('Only Excel files') || err.message.startsWith('Only ZIP files'))) {
    return res.status(400).json({
      error: { code: 'INVALID_FILE_TYPE', message: err.message },
    });
  }

  // Operational errors (expected) — return structured response
  if (err instanceof AppError && err.isOperational) {
    if (req.log) {
      req.log.warn({ err, statusCode: err.statusCode }, err.message);
    } else {
      logger.warn({ err, statusCode: err.statusCode }, err.message);
    }

    return res.status(err.statusCode).json(err.toJSON());
  }

  // Zod validation errors (from direct Zod throws, not through our middleware)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
    });
  }

  // JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      },
    });
  }

  // Unexpected errors — log full details
  const errorLog = req.log || logger;
  errorLog.error(
    {
      err,
      stack: err.stack,
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
    },
    'Unhandled error'
  );

  const isDev = process.env.NODE_ENV === 'development';
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev ? err.message : 'An unexpected error occurred',
      ...(isDev ? { stack: err.stack?.split('\n').slice(0, 3).join('\n') } : {}),
    },
  });
}

module.exports = { errorHandler };
