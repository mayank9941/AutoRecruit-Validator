'use strict';

const { HTTP_STATUS } = require('../config/constants');

/**
 * Custom error hierarchy for structured error responses.
 * All errors extend AppError and carry an HTTP status code, error code, and details.
 * The global error handler uses these to produce consistent JSON error responses.
 */

class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, HTTP_STATUS.UNAUTHORIZED, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, HTTP_STATUS.FORBIDDEN, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource', identifier = '') {
    const message = identifier
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`;
    super(message, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, HTTP_STATUS.CONFLICT, 'CONFLICT');
  }
}

class ReferenceNumberError extends AppError {
  constructor(message, code = 'REFERENCE_NUMBER_ERROR', details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, code, details);
  }
}

class ExternalServiceError extends AppError {
  constructor(serviceName, message = 'External service unavailable') {
    super(
      `${serviceName}: ${message}`,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'EXTERNAL_SERVICE_ERROR',
      { service: serviceName }
    );
    this.isOperational = true;
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ReferenceNumberError,
  ExternalServiceError,
  RateLimitError,
};
