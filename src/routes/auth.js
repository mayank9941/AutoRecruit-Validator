'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { createAuthRateLimiter } = require('../middleware/rateLimiter');
const { registerSchema, loginSchema } = require('../validators/authSchemas');

const router = Router();
const authLimiter = createAuthRateLimiter();

/**
 * Auth routes.
 *
 * Per SKILL.md §11: "thin route handlers — validate input (Zod), call a controller, return a response."
 */

// POST /api/auth/register — Create a new user
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  authController.register
);

// POST /api/auth/login — Authenticate user
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login
);

// POST /api/auth/refresh — Refresh access token
router.post(
  '/refresh',
  authController.refresh
);

// POST /api/auth/logout — Revoke refresh token
router.post(
  '/logout',
  authenticate,
  authController.logout
);

// GET /api/auth/profile — Get current user profile
router.get(
  '/profile',
  authenticate,
  authController.getProfile
);

module.exports = router;
