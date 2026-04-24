const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET announcements for a class
router.get('/:classId/announcements', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name AS teacher_name FROM announcements a
       JOIN users u ON a.teacher_id = u.id
       WHERE a.class_id = $1 ORDER BY a.created_at DESC`,
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create announcement (teacher)
router.post('/:classId/announcements', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required.' });
  try {
    const result = await pool.query(
      'INSERT INTO announcements (class_id, teacher_id, content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.classId, req.user.id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE announcement (teacher)
router.delete('/:classId/announcements/:id', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1 AND class_id = $2', [req.params.id, req.params.classId]);
    res.json({ message: 'Announcement deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET discussions for a class
router.get('/:classId/discussions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name AS author_name, u.role AS author_role FROM discussions d
       JOIN users u ON d.user_id = u.id
       WHERE d.class_id = $1 ORDER BY d.created_at ASC`,
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create discussion message
router.post('/:classId/discussions', authenticateToken, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required.' });
  try {
    const result = await pool.query(
      'INSERT INTO discussions (class_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.classId, req.user.id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
