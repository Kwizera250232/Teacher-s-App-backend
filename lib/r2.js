// Cloudflare R2 storage — files are served from the R2 public URL (Cloudflare
// edge, fast worldwide) with the VPS disk as fallback + migration source.
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const ENDPOINT = process.env.R2_ENDPOINT || '';
const BUCKET = process.env.R2_BUCKET || '';
const PUBLIC_BASE = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || '';

const enabled = Boolean(ENDPOINT && BUCKET && PUBLIC_BASE && ACCESS_KEY && SECRET_KEY);

const client = enabled
  ? new S3Client({
      region: 'auto',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    })
  : null;

// Keys already confirmed present in R2 (avoids a HEAD request per file).
const knownInR2 = new Set();
// Upload queue so bursts don't hammer R2.
const queue = [];
let pumping = false;

const CONTENT_TYPES = {
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.aac': 'audio/aac', '.webm': 'audio/webm', '.mp4': 'video/mp4',
};

function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function publicUrl(key) {
  return `${PUBLIC_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function existsInR2(key) {
  if (knownInR2.has(key)) return true;
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    knownInR2.add(key);
    return true;
  } catch {
    return false;
  }
}

async function uploadLocalToR2(localPath, key) {
  const body = fs.createReadStream(localPath);
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentTypeFor(localPath),
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  knownInR2.add(key);
}

function enqueue(localPath, key) {
  if (!enabled || knownInR2.has(key) || !fs.existsSync(localPath)) return;
  queue.push({ localPath, key });
  if (!pumping) pump();
}

async function pump() {
  pumping = true;
  while (queue.length) {
    const { localPath, key } = queue.shift();
    try {
      await uploadLocalToR2(localPath, key);
    } catch (e) {
      console.error('[r2] upload failed', key, e.message);
      // retry once later
      setTimeout(() => enqueue(localPath, key), 60000);
    }
  }
  pumping = false;
}

/**
 * Express middleware mounted on /uploads.
 * If the file exists in R2 → redirect to the fast public URL.
 * If not → serve locally and queue a background upload to R2.
 */
function r2Redirect(getLocalPath) {
  return async (req, res, next) => {
    if (!enabled) return next();
    const rel = decodeURIComponent(req.path).replace(/^\/+/, '');
    if (!rel || rel.includes('..')) return next();
    try {
      if (await existsInR2(rel)) {
        return res.redirect(302, publicUrl(rel));
      }
    } catch { /* fall through to local */ }
    const local = getLocalPath(rel);
    if (local && fs.existsSync(local)) enqueue(local, rel);
    next();
  };
}

/** For routes that stream files directly (sendFile/download) — returns R2 URL or null. */
async function r2UrlIfExists(key) {
  if (!enabled) return null;
  try {
    if (await existsInR2(key)) return publicUrl(key);
  } catch { /* ignore */ }
  return null;
}

function markUploaded(key) { knownInR2.add(key); }

module.exports = { enabled, r2Redirect, r2UrlIfExists, enqueue, markUploaded, publicUrl, uploadLocalToR2, existsInR2 };
