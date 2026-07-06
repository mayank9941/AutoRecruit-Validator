'use strict';

const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config/constants');

/**
 * Rate limiting middleware.
 * Prevents abuse and brute-force attacks.
 */

function createRateLimiter(windowMs, maxRequests) {
  if (process.env.NODE_ENV === 'test') {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs: windowMs || 15 * 60 * 1000, // 15 minutes default
    max: maxRequests || 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
      });
    },
  });
}

/**
 * Stricter rate limiter for authentication endpoints.
 * 5 attempts per 15-minute window to prevent brute-force.
 */
function createAuthRateLimiter() {
  if (process.env.NODE_ENV === 'test') {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many authentication attempts, please try again later',
        },
      });
    },
  });
}

module.exports = { createRateLimiter, createAuthRateLimiter };
