const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

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
router.post('/:classId/homework', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { title, description, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  try {
    const result = await pool.query(
      'INSERT INTO homework (class_id, title, description, due_date) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.classId, title, description || null, due_date || null]
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
       WHERE hs.homework_id = $1`,
      [req.params.hwId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
