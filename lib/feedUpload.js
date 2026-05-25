const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ensureUploadsRoot } = require('./uploads');

const MAX_FEED_SIZE = 50 * 1024 * 1024;

const ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif',
  '.mp3', '.wav', '.webm', '.m4a', '.ogg',
]);

const ALLOWED_MIME_PREFIX = [
  'image/',
  'audio/',
  'video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.',
  'text/plain',
];

function isAllowedFeedFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_EXT.has(ext)) return true;
  const mime = (file.mimetype || '').toLowerCase();
  return ALLOWED_MIME_PREFIX.some((p) => mime.startsWith(p) || mime.includes(p));
}

function feedUploadMiddleware(fieldName = 'file') {
  const root = path.join(ensureUploadsRoot(), 'feed');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, root),
    filename: (_req, file, cb) => {
      let ext = path.extname(file.originalname || '').toLowerCase();
      if (!ext && file.mimetype) {
        if (file.mimetype.includes('jpeg')) ext = '.jpg';
        else if (file.mimetype.includes('png')) ext = '.png';
        else if (file.mimetype.includes('webp')) ext = '.webp';
        else if (file.mimetype.includes('gif')) ext = '.gif';
        else if (file.mimetype.includes('webm')) ext = '.webm';
        else if (file.mimetype.includes('pdf')) ext = '.pdf';
      }
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || ''}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FEED_SIZE },
    fileFilter: (_req, file, cb) => {
      if (!isAllowedFeedFile(file)) {
        return cb(new Error('Invalid file type for classroom feed. Use JPG, PNG, PDF, or audio.'));
      }
      cb(null, true);
    },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  };
}

/** @deprecated use feedUploadMiddleware */
function createFeedUpload(fieldName) {
  return feedUploadMiddleware(fieldName);
}

module.exports = { createFeedUpload, feedUploadMiddleware };
