const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createUpload } = require('../lib/uploads');

const router = express.Router();
const uploadHomework = createUpload('file');

async function teacherOwnsClass(classId, user) {
  const teacherId = user.id;
  const owned = await pool.query(
    'SELECT id FROM classes WHERE id = $1 AND teacher_id = $2',
    [classId, teacherId]
  );
  if (owned.rows.length > 0) return true;
  if (user.role === 'head_teacher' && user.school_id) {
    const ht = await pool.query(
      `SELECT c.id FROM classes c
       JOIN users t ON c.teacher_id = t.id
       WHERE c.id = $1 AND t.school_id = $2`,
      [classId, user.school_id]
    );
    return ht.rows.length > 0;
  }
  return false;
}

// GET homework for a class
router.get('/:classId/homework', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM homework WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[homework GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create homework (teacher)
router.post('/:classId/homework', authenticateToken, requireRole('teacher', 'head_teacher'), (req, res, next) => {
  uploadHomework(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const { title, description, due_date } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });

  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });

  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;

  try {
    if (!(await teacherOwnsClass(classId, req.user))) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    const result = await pool.query(
      'INSERT INTO homework (class_id, title, description, due_date, file_path, file_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [classId, String(title).trim(), description || null, due_date || null, filePath, fileName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[homework POST] error:', err.message, err.code, err.detail);
    res.status(500).json({ error: 'Failed to create homework. Please try again.' });
  }
});

// DELETE homework (teacher)
router.delete('/:classId/homework/:hwId', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    if (!(await teacherOwnsClass(classId, req.user))) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    await pool.query('DELETE FROM homework WHERE id = $1 AND class_id = $2', [req.params.hwId, classId]);
    res.json({ message: 'Homework deleted.' });
  } catch (err) {
    console.error('[homework DELETE] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
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
    console.error('[homework submissions GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
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
    console.error('[homework my-submission GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST submit homework (student) — file or text
router.post('/:classId/homework/:hwId/submit', authenticateToken, requireRole('student'), (req, res, next) => {
  uploadHomework(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const { text_response } = req.body;
  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;
  if (!filePath && !text_response) {
    return res.status(400).json({ error: 'Please provide a file or written response.' });
  }
  if (text_response && text_response.trim().length < 200) {
    return res.status(400).json({ error: 'Written response must be at least 200 characters. Please write a more complete answer.' });
  }
  try {
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
    console.error('[homework submit] error:', err.message, err.code, err.detail);
    res.status(500).json({ error: 'Failed to submit homework. Please try again.' });
  }
});

// PUT grade a submission (teacher)
router.put('/:classId/homework/:hwId/submissions/:subId/grade', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { grade, feedback, teacher_answer } = req.body;
  if (grade === undefined || grade === null) return res.status(400).json({ error: 'Grade is required.' });
  const gradeNum = parseInt(grade, 10);
  if (Number.isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
    return res.status(400).json({ error: 'Grade must be a number between 0 and 100.' });
  }
  try {
    const result = await pool.query(
      `UPDATE homework_submissions SET grade = $1, feedback = $2, teacher_answer = $3, graded_at = NOW()
       WHERE id = $4 RETURNING *`,
      [gradeNum, feedback || null, teacher_answer || null, req.params.subId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[homework grade] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
