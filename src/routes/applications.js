'use strict';

const { Router } = require('express');
const multer = require('multer');
const applicationController = require('../controllers/applicationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validate, validateParams, validateQuery } = require('../middleware/validation');
const { jobIdParamSchema } = require('../validators/jobSchemas');
const {
  applicationIdParamSchema,
  batchIdParamSchema,
  overrideVerdictSchema,
  listApplicationsQuerySchema,
} = require('../validators/applicationSchemas');

const router = Router();

// Multer config for Excel file upload (10MB max)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are accepted'), false);
    }
  },
});

/**
 * Application routes.
 *
 * Nested under /api/jobs/:jobId/applications for applications tied to a job.
 * Also provides /api/applications/:applicationId for direct access.
 */

// GET /api/jobs/:jobId/applications — List applications for a job
router.get(
  '/jobs/:jobId/applications',
  authenticate,
  validateParams(jobIdParamSchema),
  validateQuery(listApplicationsQuerySchema),
  applicationController.listApplications
);

// POST /api/jobs/:jobId/applications/import — Import from Excel
router.post(
  '/jobs/:jobId/applications/import',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validateParams(jobIdParamSchema),
  upload.single('file'),
  applicationController.importFromExcel
);

// Multer config for ZIP file upload (100MB max)
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.match(/\.zip$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are accepted'), false);
    }
  },
});

// POST /api/jobs/:jobId/applications/import-zip — Import ZIP archive
router.post(
  '/jobs/:jobId/applications/import-zip',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validateParams(jobIdParamSchema),
  zipUpload.single('file'),
  applicationController.importZip
);

// GET /api/applications/:applicationId — Get single application
router.get(
  '/applications/:applicationId',
  authenticate,
  validateParams(applicationIdParamSchema),
  applicationController.getApplication
);

// POST /api/applications/:applicationId/override — Override verdict
router.post(
  '/applications/:applicationId/override',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validateParams(applicationIdParamSchema),
  validate(overrideVerdictSchema),
  applicationController.overrideVerdict
);

// POST /api/applications/:applicationId/evaluate — Trigger AI evaluation
router.post(
  '/applications/:applicationId/evaluate',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validateParams(applicationIdParamSchema),
  applicationController.evaluateApplication
);

// GET /api/import-batches/:batchId — Get import batch details
router.get(
  '/import-batches/:batchId',
  authenticate,
  validateParams(batchIdParamSchema),
  applicationController.getImportBatch
);

module.exports = router;
