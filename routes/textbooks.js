const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/textbooks');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed.'));
  },
});

// GET all textbooks (any authenticated user)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, subject, grade_level, book_type, file_name, created_at FROM textbooks ORDER BY grade_level, subject, book_type',
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST upload textbook (admin only)
router.post('/', authenticateToken, requireRole('admin'), upload.single('file'), async (req, res) => {
  const { title, subject, grade_level, book_type } = req.body;
  if (!title || !subject || !grade_level || !book_type) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'title, subject, grade_level and book_type are required.' });
  }
  if (!req.file) return res.status(400).json({ error: 'PDF file is required.' });

  let extractedText = '';
  try {
    // Lazy-require pdf-parse to avoid issues if module not yet installed
    const pdfParse = require('pdf-parse');
    const fileBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(fileBuffer);
    extractedText = pdfData.text || '';
  } catch (e) {
    console.error('PDF text extraction failed:', e.message);
    // Non-fatal — store without text
    extractedText = '';
  }

  try {
    const result = await pool.query(
      `INSERT INTO textbooks (title, subject, grade_level, book_type, file_path, file_name, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, title, subject, grade_level, book_type, file_name, created_at`,
      [title, subject, grade_level, book_type, req.file.filename, req.file.originalname, extractedText],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('DB error saving textbook:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE textbook (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM textbooks WHERE id = $1 RETURNING file_path',
      [req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    const filePath = path.join(__dirname, '../uploads/textbooks', result.rows[0].file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: 'Deleted.' });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
