'use strict';

const { prisma } = require('../lib/prisma');
const storage = require('../services/storage');
const { NotFoundError } = require('../utils/errors');
const { logAuditEvent } = require('../middleware/auditLogger');
const { logger } = require('../utils/logger');

/**
 * Document Controller.
 *
 * Handles generating signed URLs for downloading/viewing documents,
 * and logs document view events for audit trails.
 */

async function getDocumentUrl(req, res, next) {
  try {
    const { documentId } = req.params;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        application: {
          select: { id: true, jobId: true }
        }
      }
    });

    if (!document) {
      throw new NotFoundError('Document', documentId);
    }

    // Generate a signed URL valid for 1 hour
    const signedUrl = await storage.getSignedDownloadUrl(document.storageKey, 3600);

    // Log the view event (Phase 7: Document View Logging)
    logAuditEvent('DOCUMENT_VIEWED', {
      documentId,
      applicationId: document.applicationId,
      jobId: document.application?.jobId,
      viewedBy: req.user.id,
      documentType: document.documentType,
    });

    logger.info({ documentId, viewedBy: req.user.id }, 'Generated signed URL for document');

    res.json({
      document: {
        id: document.id,
        name: document.originalName,
        type: document.documentType,
      },
      url: signedUrl,
      expiresIn: 3600
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDocumentUrl,
};
