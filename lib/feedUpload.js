const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ensureUploadsRoot } = require('./uploads');

const MAX_FEED_SIZE = 100 * 1024 * 1024;

const ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif', '.bmp',
  '.mp3', '.wav', '.webm', '.m4a', '.ogg',
]);

function extFromMime(mime) {
  const m = (mime || '').toLowerCase();
  if (m.includes('jpeg')) return '.jpg';
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  if (m.includes('pdf')) return '.pdf';
  if (m.includes('webm')) return '.webm';
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3';
  return '';
}

function isAllowedFeedFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (ALLOWED_EXT.has(ext)) return true;
  if (mime.startsWith('image/') || mime.startsWith('audio/')) return true;
  if (mime === 'application/pdf') return true;
  if (mime.includes('msword') || mime.includes('wordprocessing') || mime.includes('presentation')) return true;
  if (mime === 'text/plain') return true;
  if ((mime === 'application/octet-stream' || !mime) && ALLOWED_EXT.has(ext)) return true;
  return false;
}

function feedUploadMiddleware(fieldName = 'file') {
  const root = path.join(ensureUploadsRoot(), 'feed');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, root),
    filename: (_req, file, cb) => {
      let ext = path.extname(file.originalname || '').toLowerCase();
      if (!ext) ext = extFromMime(file.mimetype);
      if (!ext && (file.mimetype || '').startsWith('image/')) ext = '.jpg';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || ''}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FEED_SIZE, files: 1, fields: 20 },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE' || /file too large/i.test(String(err.message))) {
          return res.status(413).json({
            error: 'Photo is too large. Please use a smaller image (under 10MB) or refresh the page and try again.',
          });
        }
        if (/invalid file type/i.test(String(err.message))) {
          return res.status(400).json({ error: err.message });
        }
        console.error('[feedUpload]', err.message);
        return res.status(400).json({ error: err.message || 'Upload failed.' });
      }

      if (req.file && !isAllowedFeedFile(req.file)) {
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        return res.status(400).json({
          error: 'File type not supported. Use JPG, PNG, WEBP, PDF, or audio.',
        });
      }

      next();
    });
  };
}

function createFeedUpload(fieldName) {
  return feedUploadMiddleware(fieldName);
}

module.exports = { createFeedUpload, feedUploadMiddleware, isAllowedFeedFile };
