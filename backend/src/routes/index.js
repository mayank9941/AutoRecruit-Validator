'use strict';

const { Router } = require('express');
const healthRouter = require('./health');
const authRouter = require('./auth');
const jobsRouter = require('./jobs');
const applicationRouter = require('./applications');
const documentsRouter = require('./documents');

const router = Router();

// Health check — no auth required, used by ALB/ECS
router.use(healthRouter);

// Phase 1: Authentication
router.use('/api/auth', authRouter);

// Phase 2: Jobs & Checklists
router.use('/api/jobs', jobsRouter);

// Phase 3: Applications & Import
router.use('/api', applicationRouter);

// Phase 7: Documents
router.use('/api/documents', documentsRouter);

// 404 handler for unmatched routes
router.use('/api/*', (_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
});

module.exports = router;
