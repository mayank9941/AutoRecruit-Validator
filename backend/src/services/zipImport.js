'use strict';

const unzipper = require('unzipper');
const mime = require('mime-types');
const path = require('path');
const { logger } = require('../utils/logger');
const storage = require('./storage');
const { ValidationError } = require('../utils/errors');

/**
 * ZIP Import Service.
 */
async function processZipImport(zipStream, jobId, postingCode, archiveName = null) {
  logger.info({ jobId, archiveName }, 'Starting ZIP import processing');

  const uploadedFiles = [];
  const failedFiles = [];
  let totalExtracted = 0;

  try {
    const zip = zipStream.pipe(unzipper.Parse({ forceStream: true }));

    for await (const entry of zip) {
      const fileName = entry.path;
      const type = entry.type;

      if (type === 'Directory' || fileName.startsWith('__MACOSX/') || fileName.includes('/.')) {
        entry.autodrain();
        continue;
      }

      totalExtracted++;
      const mimeType = mime.lookup(fileName) || 'application/octet-stream';
      const fileBaseName = path.basename(fileName);

      try {
        const storageKey = storage.generateKey('document', postingCode, `imports/${Date.now()}_${fileBaseName}`);
        const chunks = [];
        for await (const chunk of entry) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        const uploadResult = await storage.upload(storageKey, buffer, mimeType, {
          jobId,
          originalName: fileName,
          archiveName: archiveName || '',
        });

        uploadedFiles.push({
          originalPath: fileName,
          archiveName,
          storageKey: uploadResult.key,
          storageBucket: uploadResult.bucket,
          mimeType,
          size: buffer.length,
        });
      } catch (err) {
        logger.error({ fileName, error: err.message }, 'Failed to upload extracted file');
        failedFiles.push({
          originalPath: fileName,
          error: err.message,
        });
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, 'ZIP parsing failed');
    throw new ValidationError('Failed to parse ZIP file: ' + error.message);
  }

  logger.info(
    {
      jobId,
      totalExtracted,
      uploadedCount: uploadedFiles.length,
      failedCount: failedFiles.length,
    },
    'ZIP import processing completed'
  );

  return { uploadedFiles, failedFiles, totalExtracted };
}

module.exports = {
  processZipImport,
};
