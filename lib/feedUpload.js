const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ensureUploadsRoot } = require('./uploads');

const MAX_FEED_SIZE = 50 * 1024 * 1024;

const ALLOWED = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.mp3', '.wav', '.webm', '.m4a', '.ogg',
]);

function createFeedUpload(fieldName = 'file') {
  const root = path.join(ensureUploadsRoot(), 'feed');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, root),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FEED_SIZE },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED.has(ext)) {
        return cb(new Error('Invalid file type for classroom feed.'));
      }
      cb(null, true);
    },
  });

  return upload.single(fieldName);
}

module.exports = { createFeedUpload };
