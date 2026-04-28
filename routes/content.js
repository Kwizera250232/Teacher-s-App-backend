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
      `SELECT d.*, u.name AS author_name, u.role AS author_role,
         (SELECT COUNT(*) FROM discussion_likes dl WHERE dl.discussion_id = d.id) AS like_count,
         EXISTS(SELECT 1 FROM discussion_likes dl WHERE dl.discussion_id = d.id AND dl.user_id = $2) AS liked_by_me
       FROM discussions d
       JOIN users u ON d.user_id = u.id
       WHERE d.class_id = $1 ORDER BY d.created_at ASC`,
      [req.params.classId, req.user.id]
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

// POST like / unlike a discussion
router.post('/discussions/:discussionId/like', authenticateToken, async (req, res) => {
  const did = parseInt(req.params.discussionId);
  try {
    const existing = await pool.query(
      'SELECT id FROM discussion_likes WHERE discussion_id=$1 AND user_id=$2',
      [did, req.user.id]
    );
    if (existing.rowCount > 0) {
      await pool.query('DELETE FROM discussion_likes WHERE discussion_id=$1 AND user_id=$2', [did, req.user.id]);
      const cnt = await pool.query('SELECT COUNT(*) FROM discussion_likes WHERE discussion_id=$1', [did]);
      res.json({ liked: false, like_count: parseInt(cnt.rows[0].count) });
    } else {
      await pool.query('INSERT INTO discussion_likes (discussion_id, user_id) VALUES ($1,$2)', [did, req.user.id]);
      const cnt = await pool.query('SELECT COUNT(*) FROM discussion_likes WHERE discussion_id=$1', [did]);
      res.json({ liked: true, like_count: parseInt(cnt.rows[0].count) });
    }
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET comments for a discussion
router.get('/discussions/:discussionId/comments', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dc.*, u.name AS author_name, u.role AS author_role
       FROM discussion_comments dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.discussion_id=$1 ORDER BY dc.created_at ASC`,
      [req.params.discussionId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST add comment to a discussion
router.post('/discussions/:discussionId/comments', authenticateToken, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required.' });
  try {
    const result = await pool.query(
      'INSERT INTO discussion_comments (discussion_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.discussionId, req.user.id, content.trim()]
    );
    // Attach author name
    const user = await pool.query('SELECT name, role FROM users WHERE id=$1', [req.user.id]);
    res.status(201).json({ ...result.rows[0], author_name: user.rows[0]?.name, author_role: user.rows[0]?.role });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

