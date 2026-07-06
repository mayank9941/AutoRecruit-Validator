'use strict';

const { AuthorizationError } = require('../utils/errors');

/**
 * Role-Based Access Control Middleware.
 *
 * Per SKILL.md §10: "Never trust frontend authorization. Authorization must always happen server-side."
 * Per assumption A5: Hiring managers are view-only — only recruiters can submit overrides.
 */

/**
 * Require the authenticated user to have one of the specified roles.
 *
 * @param {...string} allowedRoles - Roles that are allowed access
 * @returns {Function} Express middleware
 *
 * Usage:
 *   router.post('/endpoint', authenticate, requireRole('ADMIN', 'RECRUITER'), controller.handler);
 */
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required before authorization check'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AuthorizationError(
          `Role '${req.user.role}' does not have permission for this action. Required: ${allowedRoles.join(' or ')}`
        )
      );
    }

    next();
  };
}

/**
 * Require the authenticated user to be the resource owner or have an admin role.
 *
 * @param {Function} getOwnerId - Function that extracts the owner ID from the request (req) => ownerId
 * @returns {Function} Express middleware
 */
function requireOwnerOrRole(getOwnerId, ...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Authentication required'));
    }

    const ownerId = getOwnerId(req);

    // Owner can always access
    if (req.user.id === ownerId) {
      return next();
    }

    // Otherwise, check role
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AuthorizationError('Insufficient permissions'));
    }

    next();
  };
}

module.exports = { requireRole, requireOwnerOrRole };
