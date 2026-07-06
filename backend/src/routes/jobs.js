'use strict';

const { Router } = require('express');
const jobController = require('../controllers/jobController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate, validateParams } = require('../middleware/validation');
const {
  createJobSchema,
  updateJobSchema,
  lockChecklistSchema,
  jobIdParamSchema,
} = require('../validators/jobSchemas');

const router = Router();

/**
 * Job routes.
 *
 * Per SKILL.md §10: All endpoints check user role server-side.
 * Per assumption A5: Hiring managers are view-only.
 */

// GET /api/jobs — List all jobs (all authenticated users)
router.get(
  '/',
  authenticate,
  jobController.listJobs
);

// GET /api/jobs/:jobId — Get a single job
router.get(
  '/:jobId',
  authenticate,
  validateParams(jobIdParamSchema),
  jobController.getJob
);

// POST /api/jobs — Create a new job (Admin, Recruiter only)
router.post(
  '/',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validate(createJobSchema),
  jobController.createJob
);

// PATCH /api/jobs/:jobId — Update a job (Admin, Recruiter only)
router.patch(
  '/:jobId',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validateParams(jobIdParamSchema),
  validate(updateJobSchema),
  jobController.updateJob
);

// POST /api/jobs/:jobId/lock-checklist — Lock checklist (Admin, Recruiter only)
router.post(
  '/:jobId/lock-checklist',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validateParams(jobIdParamSchema),
  validate(lockChecklistSchema),
  jobController.lockChecklist
);

// GET /api/jobs/:jobId/checklist-versions — Get checklist history
router.get(
  '/:jobId/checklist-versions',
  authenticate,
  validateParams(jobIdParamSchema),
  jobController.getChecklistVersions
);

module.exports = router;
