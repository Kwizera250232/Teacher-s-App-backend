const fs = require('fs');
const path = require('path');
const multer = require('multer');

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.png', '.jpg', '.jpeg', '.webp',
]);

function getUploadsRoot() {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  if (process.env.VERCEL) return path.join('/tmp', 'uploads');
  return path.join(__dirname, '..', 'uploads');
}

function ensureUploadsRoot() {
  const root = getUploadsRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function createUpload(fieldName = 'file') {
  const uploadsDir = ensureUploadsRoot();
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, unique + ext);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_SIZE },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, PPT, PPTX, TXT, and images.'));
      }
      cb(null, true);
    },
  });

  return upload.single(fieldName);
}

module.exports = { getUploadsRoot, ensureUploadsRoot, createUpload, MAX_UPLOAD_SIZE };
