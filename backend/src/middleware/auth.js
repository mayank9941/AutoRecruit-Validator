'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { AuthenticationError } = require('../utils/errors');
const { config } = require('../config');
const { logger } = require('../utils/logger');

/**
 * JWT Authentication Middleware.
 *
 * Per SKILL.md §10: "All API endpoints touching candidate or application data must check
 * the requesting user's role and access scope server-side."
 *
 * Per SKILL.md §3: JWT auth — do not introduce a second auth system.
 */

/**
 * Verify JWT token from Authorization header.
 * Extracts user info and attaches to req.user.
 */
function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new AuthenticationError('No authorization header provided'));
  }

  if (!authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Invalid authorization format. Use: Bearer <token>'));
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return next(new AuthenticationError('No token provided'));
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Token has expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new AuthenticationError('Invalid token'));
    }
    logger.error({ err: error }, 'Unexpected JWT verification error');
    return next(new AuthenticationError('Authentication failed'));
  }
}

/**
 * Optional authentication — does not fail if no token is present.
 * Useful for endpoints that behave differently for authenticated vs anonymous users.
 */
function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
    };
  } catch {
    req.user = null;
  }

  next();
}

/**
 * Generate JWT access token.
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      type: 'access',
    },
    config.JWT_SECRET,
    {
      expiresIn: config.JWT_EXPIRES_IN,
      algorithm: 'HS256',
    }
  );
}

/**
 * Generate JWT refresh token.
 */
function generateRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      type: 'refresh',
      jti: uuidv4(),
    },
    config.JWT_REFRESH_SECRET,
    {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN,
      algorithm: 'HS256',
    }
  );
}

/**
 * Verify a refresh token.
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    });
  } catch (error) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
}

module.exports = {
  authenticate,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
};
