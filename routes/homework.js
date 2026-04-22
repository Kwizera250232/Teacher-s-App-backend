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

// GET homework for a class
router.get('/:classId/homework', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM homework WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create homework (teacher)
router.post('/:classId/homework', authenticateToken, requireRole('teacher'), upload.single('file'), async (req, res) => {
  const { title, description, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;
  try {
    const result = await pool.query(
      'INSERT INTO homework (class_id, title, description, due_date, file_path, file_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.classId, title, description || null, due_date || null, filePath, fileName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE homework (teacher)
router.delete('/:classId/homework/:hwId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM homework WHERE id = $1 AND class_id = $2', [req.params.hwId, req.params.classId]);
    res.json({ message: 'Homework deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET submissions for a homework (teacher)
router.get('/:classId/homework/:hwId/submissions', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT hs.*, u.name AS student_name FROM homework_submissions hs
       JOIN users u ON hs.student_id = u.id
       WHERE hs.homework_id = $1
       ORDER BY hs.submitted_at DESC`,
      [req.params.hwId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET student's own submission for a homework
router.get('/:classId/homework/:hwId/my-submission', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM homework_submissions WHERE homework_id = $1 AND student_id = $2',
      [req.params.hwId, req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST submit homework (student) — file or text
router.post('/:classId/homework/:hwId/submit', authenticateToken, requireRole('student'), upload.single('file'), async (req, res) => {
  const { text_response } = req.body;
  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;
  if (!filePath && !text_response) {
    return res.status(400).json({ error: 'Please provide a file or written response.' });
  }
  try {
    // Upsert — update if already submitted
    const result = await pool.query(
      `INSERT INTO homework_submissions (homework_id, student_id, file_path, file_name, text_response, submitted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (homework_id, student_id)
       DO UPDATE SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name,
         text_response = EXCLUDED.text_response, submitted_at = NOW(),
         grade = NULL, feedback = NULL, graded_at = NULL
       RETURNING *`,
      [req.params.hwId, req.user.id, filePath, fileName, text_response || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT grade a submission (teacher)
router.put('/:classId/homework/:hwId/submissions/:subId/grade', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { grade, feedback } = req.body;
  if (grade === undefined || grade === null) return res.status(400).json({ error: 'Grade is required.' });
  const gradeNum = parseInt(grade);
  if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
    return res.status(400).json({ error: 'Grade must be a number between 0 and 100.' });
  }
  try {
    const result = await pool.query(
      `UPDATE homework_submissions SET grade = $1, feedback = $2, graded_at = NOW()
       WHERE id = $3 RETURNING *`,
      [gradeNum, feedback || null, req.params.subId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
