// Cloudflare R2 storage service for gen.aditor.ai
// Handles upload/download of images and videos to R2 bucket

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'caf450765faba6d0bd111820e62868ef';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'aditorstudio';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // Set if using custom domain or public bucket

const r2Client = R2_ACCESS_KEY ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
}) : null;

if (r2Client) {
  console.log('[R2] Connected to Cloudflare R2 bucket:', R2_BUCKET);
} else {
  console.log('[R2] Not configured (missing R2_ACCESS_KEY_ID). Files stored locally only.');
}

/**
 * Upload a file to R2
 * @param {Buffer|string} fileOrPath - Buffer or local file path
 * @param {string} key - R2 object key (e.g., "images/user@email/gen-uuid.png")
 * @param {string} contentType - MIME type
 * @returns {string} URL to the uploaded file
 */
async function upload(fileOrPath, key, contentType) {
  if (!r2Client) {
    throw new Error('R2 not configured');
  }

  let body;
  if (Buffer.isBuffer(fileOrPath)) {
    body = fileOrPath;
  } else if (typeof fileOrPath === 'string') {
    body = fs.readFileSync(fileOrPath);
  } else {
    throw new Error('fileOrPath must be a Buffer or file path string');
  }

  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  // Return the URL
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }
  // Use /r2/ proxy route (works without public bucket access)
  return `/r2/${key}`;
}

/**
 * Upload a local file to R2 and return the URL
 * Convenience wrapper that determines content type from extension
 */
async function uploadFile(localPath, key) {
  const ext = path.extname(localPath).toLowerCase();
  const contentTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  return upload(localPath, key, contentType);
}

/**
 * Upload a generated image to R2
 * @param {string} localPath - path to the image file
 * @param {string} userEmail - user email for namespace isolation
 * @returns {string} public URL
 */
async function uploadImage(localPath, userEmail) {
  const filename = path.basename(localPath);
  const safeEmail = (userEmail || 'anonymous').replace(/[^a-zA-Z0-9@._-]/g, '_');
  const key = `images/${safeEmail}/${filename}`;
  return uploadFile(localPath, key);
}

/**
 * Upload a generated video to R2
 * @param {string} localPath - path to the video file
 * @param {string} userEmail - user email for namespace isolation
 * @returns {string} public URL
 */
async function uploadVideo(localPath, userEmail) {
  const filename = path.basename(localPath);
  const safeEmail = (userEmail || 'anonymous').replace(/[^a-zA-Z0-9@._-]/g, '_');
  const key = `videos/${safeEmail}/${filename}`;
  return uploadFile(localPath, key);
}

/**
 * Upload from a remote URL (download then upload to R2)
 * @param {string} url - remote URL to download
 * @param {string} key - R2 key
 * @param {number} timeout - download timeout in ms
 * @returns {string} R2 URL
 */
async function uploadFromUrl(url, key, timeout = 120000) {
  const axios = require('axios');
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout });
  const contentType = response.headers['content-type'] || 'application/octet-stream';
  return upload(Buffer.from(response.data), key, contentType);
}

/**
 * Check if R2 is configured and available
 */
function isConfigured() {
  return !!r2Client;
}

module.exports = {
  upload,
  uploadFile,
  uploadImage,
  uploadVideo,
  uploadFromUrl,
  isConfigured,
  R2_BUCKET,
  R2_PUBLIC_URL,
};
