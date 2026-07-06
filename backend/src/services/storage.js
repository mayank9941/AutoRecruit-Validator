'use strict';

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { config } = require('../config');
const { logger } = require('../utils/logger');

/**
 * Storage service abstraction.
 *
 * Uses S3 in production/staging, local filesystem in development.
 * Per SKILL.md §3: AWS S3 for document storage with signed URLs.
 */

const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'local-storage');

// Ensure local storage directory exists in development
if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}

let s3Client = null;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.AWS_REGION,
      credentials: config.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
          }
        : undefined, // Use default credential chain in ECS
    });
  }
  return s3Client;
}

/**
 * Upload a file to storage.
 *
 * @param {string} key - The storage key (e.g., 'jobs/1900/notices/notice.pdf')
 * @param {Buffer|ReadableStream} body - File content
 * @param {string} mimeType - MIME type
 * @param {Object} metadata - Optional metadata
 * @returns {Promise<{ key: string, bucket: string, url: string }>}
 */
async function upload(key, body, mimeType, metadata = {}) {
  if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
    return uploadLocal(key, body, mimeType, metadata);
  }
  return uploadS3(key, body, mimeType, metadata);
}

async function uploadS3(key, body, mimeType, metadata) {
  const client = getS3Client();
  const bucket = config.S3_BUCKET_NAME;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: metadata,
      ServerSideEncryption: 'AES256',
    })
  );

  logger.info({ key, bucket, mimeType }, 'File uploaded to S3');

  return { key, bucket, url: `s3://${bucket}/${key}` };
}

async function uploadLocal(key, body, mimeType, _metadata) {
  const filePath = path.join(LOCAL_STORAGE_DIR, key);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Convert stream to buffer if needed
  let buffer = body;
  if (body && typeof body.pipe === 'function') {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    buffer = Buffer.concat(chunks);
  }

  fs.writeFileSync(filePath, buffer);
  logger.info({ key, filePath, mimeType }, 'File uploaded to local storage');

  return { key, bucket: 'local', url: `file://${filePath}` };
}

/**
 * Download a file from storage.
 *
 * @param {string} key - The storage key
 * @returns {Promise<Buffer>}
 */
async function download(key) {
  if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
    return downloadLocal(key);
  }
  return downloadS3(key);
}

async function downloadS3(key) {
  const client = getS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: key,
    })
  );

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function downloadLocal(key) {
  const filePath = path.join(LOCAL_STORAGE_DIR, key);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found in local storage: ${key}`);
  }

  return fs.readFileSync(filePath);
}

/**
 * Delete a file from storage.
 *
 * @param {string} key - The storage key
 */
async function deleteFile(key) {
  if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
    return deleteLocal(key);
  }
  return deleteS3(key);
}

async function deleteS3(key) {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: key,
    })
  );
  logger.info({ key }, 'File deleted from S3');
}

async function deleteLocal(key) {
  const filePath = path.join(LOCAL_STORAGE_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info({ key }, 'File deleted from local storage');
  }
}

/**
 * Generate a pre-signed URL for a file.
 *
 * Per SKILL.md §3: Signed URLs for document access.
 *
 * @param {string} key - The storage key
 * @param {number} expiresIn - Seconds until URL expires (default: 3600)
 * @returns {Promise<string>}
 */
async function getSignedDownloadUrl(key, expiresIn = config.S3_SIGNED_URL_EXPIRY) {
  if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
    // In development, return a local file URL
    const filePath = path.join(LOCAL_STORAGE_DIR, key);
    return `file://${filePath}`;
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: config.S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate a storage key for a specific entity type.
 *
 * @param {'notice'|'application'|'document'} type
 * @param {string} postingCode
 * @param {string} [fileName]
 * @returns {string}
 */
function generateKey(type, postingCode, fileName) {
  const timestamp = Date.now();

  switch (type) {
    case 'notice':
      return `jobs/${postingCode}/notices/${timestamp}_${fileName}`;
    case 'application':
      return `jobs/${postingCode}/applications/${fileName}`;
    case 'document':
      return `jobs/${postingCode}/documents/${fileName}`;
    default:
      return `misc/${postingCode}/${timestamp}_${fileName}`;
  }
}

module.exports = {
  upload,
  download,
  deleteFile,
  getSignedDownloadUrl,
  generateKey,
};
