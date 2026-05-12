const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const VALID_TYPES = ['lesson','dream','motivation','composition'];

// Auto-create/migrate tables on server start
pool.query(`
  CREATE TABLE IF NOT EXISTS student_shares (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    visibility VARCHAR(20) NOT NULL DEFAULT 'subscribers'
  );
  CREATE INDEX IF NOT EXISTS idx_student_shares_type ON student_shares(type);
  CREATE INDEX IF NOT EXISTS idx_student_shares_student ON student_shares(student_id);
  ALTER TABLE student_shares DROP CONSTRAINT IF EXISTS student_shares_type_check;
  ALTER TABLE student_shares ADD CONSTRAINT student_shares_type_check
    CHECK (type IN ('lesson','dream','motivation','composition'));
  ALTER TABLE student_shares DROP CONSTRAINT IF EXISTS student_shares_visibility_check;
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS school VARCHAR(200);
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS class_name VARCHAR(100);
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(100);
  CREATE TABLE IF NOT EXISTS student_share_likes (
    share_id INTEGER NOT NULL REFERENCES student_shares(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (share_id, student_id)
  );
`).catch(e => console.error('[student_shares] migration error:', e.message));

// POST / — create share
router.post('/', authenticateToken, requireRole('student'), async (req, res) => {
  const { type, content, school, class_name, teacher_name } = req.body;
  if (!VALID_TYPES.includes(type) || !content || content.length < 5) {
    return res.status(400).json({ error: 'Invalid share.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO student_shares (student_id, type, content, school, class_name, teacher_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, type, content.trim(), school || null, class_name || null, teacher_name || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET / — list shares (self + subscribed), with like counts
router.get('/', authenticateToken, requireRole('student'), async (req, res) => {
  const { type } = req.query;
  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid type.' });
  }
  try {
    const shares = await pool.query(
      `SELECT s.id, s.student_id, s.type, s.content, s.created_at,
              s.school, s.class_name, s.teacher_name,
              u.name AS student_name,
              COUNT(l.student_id)::int AS like_count,
              BOOL_OR(l.student_id = $2) AS liked_by_me
       FROM student_shares s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN student_share_likes l ON l.share_id = s.id
       WHERE ($1::text IS NULL OR s.type = $1)
         AND (s.student_id = $2 OR s.student_id IN (
               SELECT target_id FROM subscriptions WHERE subscriber_id = $2
             ))
       GROUP BY s.id, u.name
       ORDER BY s.created_at DESC
       LIMIT 200`,
      [type || null, req.user.id]
    );
    res.json(shares.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /:id/like — toggle like
router.post('/:id/like', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    // Try insert; if already exists, delete (toggle)
    const existing = await pool.query(
      `SELECT 1 FROM student_share_likes WHERE share_id=$1 AND student_id=$2`,
      [req.params.id, req.user.id]
    );
    if (existing.rowCount > 0) {
      await pool.query(`DELETE FROM student_share_likes WHERE share_id=$1 AND student_id=$2`,
        [req.params.id, req.user.id]);
      res.json({ liked: false });
    } else {
      await pool.query(`INSERT INTO student_share_likes (share_id, student_id) VALUES ($1,$2)`,
        [req.params.id, req.user.id]);
      res.json({ liked: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /user/:userId — get a specific user's shares (own, subscribed, or teacher)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.userId);
  const viewerId = req.user.id;
  const viewerRole = req.user.role;
  if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid user.' });

  // Students must be subscribed (or viewing own). Teachers can view anyone.
  if (viewerRole === 'student' && targetId !== viewerId) {
    try {
      const sub = await pool.query(
        `SELECT 1 FROM subscriptions WHERE subscriber_id = $1 AND target_id = $2`,
        [viewerId, targetId]
      );
      if (sub.rowCount === 0) {
        return res.status(403).json({ error: 'Subscribe to view this student\'s compositions.' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }

  try {
    const shares = await pool.query(
      `SELECT s.id, s.student_id, s.type, s.content, s.created_at,
              s.school, s.class_name, s.teacher_name,
              u.name AS student_name,
              COUNT(l.student_id)::int AS like_count,
              BOOL_OR(l.student_id = $2) AS liked_by_me
       FROM student_shares s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN student_share_likes l ON l.share_id = s.id
       WHERE s.student_id = $1
       GROUP BY s.id, u.name
       ORDER BY s.created_at DESC
       LIMIT 100`,
      [targetId, viewerId]
    );
    res.json(shares.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /:id — delete own share
router.delete('/:id', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const del = await pool.query(
      `DELETE FROM student_shares WHERE id=$1 AND student_id=$2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (del.rowCount === 0) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
