const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ensureUploadsRoot } = require('./uploads');

const MAX_SIZE = 12 * 1024 * 1024;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif']);

function isImage(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  return mime.startsWith('image/') || IMAGE_EXT.has(ext);
}

function momentPhotosMiddleware() {
  const root = path.join(ensureUploadsRoot(), 'moments');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, root),
    filename: (_req, file, cb) => {
      let ext = path.extname(file.originalname || '').toLowerCase();
      if (!ext && (file.mimetype || '').startsWith('image/')) ext = '.jpg';
      cb(null, `moment-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE, files: 10, fields: 10 },
  }).array('photos', 10);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'A photo is too large (max 12MB each).' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: 'Maximum 10 photos per moment.' });
        }
        return res.status(400).json({ error: err.message || 'Upload failed.' });
      }
      const files = req.files || [];
      for (const f of files) {
        if (!isImage(f)) {
          files.forEach((x) => {
            try {
              fs.unlinkSync(x.path);
            } catch {
              /* ignore */
            }
          });
          return res.status(400).json({ error: 'Only image files are allowed (JPG, PNG, WEBP).' });
        }
      }
      if (!files.length) {
        return res.status(400).json({ error: 'Add at least one photo.' });
      }
      next();
    });
  };
}

module.exports = { momentPhotosMiddleware };
