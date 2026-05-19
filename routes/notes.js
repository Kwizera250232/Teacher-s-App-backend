const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createUpload } = require('../lib/uploads');

const router = express.Router();
const uploadNote = createUpload('file');

async function teacherOwnsClass(classId, teacherId) {
  const result = await pool.query(
    'SELECT id FROM classes WHERE id = $1 AND teacher_id = $2',
    [classId, teacherId]
  );
  return result.rows.length > 0;
}

// GET notes for a class
router.get('/:classId/notes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notes WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[notes GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST upload note (teacher)
router.post('/:classId/notes', authenticateToken, requireRole('teacher'), (req, res, next) => {
  uploadNote(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const { title } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });

  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;

  try {
    if (!(await teacherOwnsClass(classId, req.user.id))) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    const result = await pool.query(
      'INSERT INTO notes (class_id, title, file_path, file_name) VALUES ($1,$2,$3,$4) RETURNING *',
      [classId, String(title).trim(), filePath, fileName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[notes POST] error:', err.message, err.code, err.detail);
    res.status(500).json({ error: 'Failed to upload note. Please try again.' });
  }
});

// DELETE note (teacher)
router.delete('/:classId/notes/:noteId', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    if (!(await teacherOwnsClass(classId, req.user.id))) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    await pool.query('DELETE FROM notes WHERE id = $1 AND class_id = $2', [req.params.noteId, classId]);
    res.json({ message: 'Note deleted.' });
  } catch (err) {
    console.error('[notes DELETE] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
