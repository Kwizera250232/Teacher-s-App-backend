const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// GET notes for a class
router.get('/:classId/notes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notes WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload note (teacher)
router.post('/:classId/notes', authenticateToken, requireRole('teacher'), upload.single('file'), async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;
  try {
    const result = await pool.query(
      'INSERT INTO notes (class_id, title, file_path, file_name) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.classId, title, filePath, fileName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE note (teacher)
router.delete('/:classId/notes/:noteId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM notes WHERE id = $1 AND class_id = $2', [req.params.noteId, req.params.classId]);
    res.json({ message: 'Note deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
