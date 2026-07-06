'use strict';

const { Router } = require('express');
const documentController = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateParams } = require('../middleware/validation');
const { z } = require('zod');

const router = Router();

const documentIdParamSchema = z.object({
  documentId: z.string().uuid('Invalid document ID format'),
});

// GET /api/documents/:documentId/url — Get a signed URL for a document
router.get(
  '/:documentId/url',
  authenticate,
  requireRole('ADMIN', 'RECRUITER'),
  validateParams(documentIdParamSchema),
  documentController.getDocumentUrl
);

module.exports = router;
