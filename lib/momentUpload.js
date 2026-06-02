const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ensureUploadsRoot, MAX_UPLOAD_SIZE } = require('./uploads');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.heic', '.heif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.3gp', '.m4v', '.mkv']);

function isAllowedMedia(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (mime.startsWith('image/') || IMAGE_EXT.has(ext)) return true;
  if (mime.startsWith('video/') || VIDEO_EXT.has(ext)) return true;
  return false;
}

function momentPhotosMiddleware() {
  const root = path.join(ensureUploadsRoot(), 'moments');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, root),
    filename: (_req, file, cb) => {
      let ext = path.extname(file.originalname || '').toLowerCase();
      const mime = (file.mimetype || '').toLowerCase();
      if (!ext && mime.startsWith('image/')) ext = '.jpg';
      if (!ext && mime.startsWith('video/')) ext = '.mp4';
      cb(null, `moment-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_SIZE, files: 10, fields: 12 },
  }).fields([{ name: 'photos', maxCount: 10 }]);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'A file is too large. Try a shorter video or fewer items.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'Maximum 10 photos or videos per moment.' });
        }
        return res.status(400).json({ error: err.message || 'Upload failed.' });
      }

      const files = [];
      const fromFields = req.files?.photos;
      if (Array.isArray(fromFields)) files.push(...fromFields);
      else if (fromFields) files.push(fromFields);

      for (const f of files) {
        if (!isAllowedMedia(f)) {
          files.forEach((x) => {
            try {
              fs.unlinkSync(x.path);
            } catch {
              /* ignore */
            }
          });
          return res.status(400).json({
            error: 'Only photos (JPG, PNG, WEBP) or videos (MP4, MOV, WEBM) are allowed.',
          });
        }
      }

      if (!files.length) {
        return res.status(400).json({ error: 'Add at least one photo or video.' });
      }

      req.files = files;
      return next();
    });
  };
}

module.exports = { momentPhotosMiddleware, isAllowedMedia };
