const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const VALID_TYPES = ['lesson', 'dream', 'motivation', 'composition'];

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
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS review_note TEXT;
  ALTER TABLE student_shares DROP CONSTRAINT IF EXISTS student_shares_status_check;
  ALTER TABLE student_shares ADD CONSTRAINT student_shares_status_check
    CHECK (status IN ('pending','approved','declined'));
  UPDATE student_shares SET status='approved' WHERE status IS NULL;
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS student_share_likes (
    share_id INTEGER NOT NULL REFERENCES student_shares(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (share_id, student_id)
  );
`).catch(e => console.error('[student_shares] migration error:', e.message));

router.post('/', authenticateToken, requireRole('student'), async (req, res) => {
  const { type, content, school, class_name, teacher_name } = req.body;
  if (!VALID_TYPES.includes(type) || !content || content.length < 5) {
    return res.status(400).json({ error: 'Invalid share.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO student_shares (student_id, type, content, school, class_name, teacher_name, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [req.user.id, type, content.trim(), school || null, class_name || null, teacher_name || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[student_shares POST]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** Class + own compositions for student home (classmates, teachers, parents via approved). */
router.get('/dashboard', authenticateToken, requireRole('student'), async (req, res) => {
  const studentId = req.user.id;
  try {
    const shares = await pool.query(
      `SELECT s.id, s.student_id, s.type, s.content, s.created_at, s.pinned,
              s.school, s.class_name, s.teacher_name, s.status, s.review_note,
              u.name AS student_name,
              COUNT(l.student_id)::int AS like_count,
              BOOL_OR(l.student_id = $1) AS liked_by_me
       FROM student_shares s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN student_share_likes l ON l.share_id = s.id
       WHERE s.type = 'composition'
         AND (
           s.student_id = $1
           OR (
             s.status = 'approved'
             AND s.student_id IN (
               SELECT DISTINCT cm2.student_id
               FROM class_members cm1
               JOIN class_members cm2 ON cm1.class_id = cm2.class_id
               WHERE cm1.student_id = $1 AND cm2.student_id <> $1
             )
           )
         )
       GROUP BY s.id, u.name
       ORDER BY s.pinned DESC, s.created_at DESC
       LIMIT 80`,
      [studentId]
    );
    res.json(shares.rows);
  } catch (err) {
    console.error('[student_shares/dashboard]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.patch('/:id/pin', authenticateToken, requireRole('student'), async (req, res) => {
  const shareId = parseInt(req.params.id, 10);
  const { pinned } = req.body;
  if (!Number.isFinite(shareId)) return res.status(400).json({ error: 'Invalid share.' });
  try {
    const upd = await pool.query(
      `UPDATE student_shares SET pinned = $1
       WHERE id = $2 AND student_id = $3 AND type = 'composition'
       RETURNING id, pinned`,
      [Boolean(pinned), shareId, req.user.id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Composition not found.' });
    res.json(upd.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/', authenticateToken, requireRole('student'), async (req, res) => {
  const { type } = req.query;
  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid type.' });
  }
  try {
    const shares = await pool.query(
      `SELECT s.id, s.student_id, s.type, s.content, s.created_at, s.pinned,
              s.school, s.class_name, s.teacher_name, s.status, s.review_note,
              u.name AS student_name,
              COUNT(l.student_id)::int AS like_count,
              BOOL_OR(l.student_id = $2) AS liked_by_me
       FROM student_shares s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN student_share_likes l ON l.share_id = s.id
       WHERE ($1::text IS NULL OR s.type = $1)
         AND (
           s.student_id = $2
           OR (
             s.status = 'approved'
             AND s.student_id IN (
               SELECT target_id FROM subscriptions WHERE subscriber_id = $2
             )
           )
         )
       GROUP BY s.id, u.name
       ORDER BY s.pinned DESC, s.created_at DESC
       LIMIT 200`,
      [type || null, req.user.id]
    );
    res.json(shares.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/:id/like', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT 1 FROM student_share_likes WHERE share_id=$1 AND student_id=$2',
      [req.params.id, req.user.id]
    );
    if (existing.rowCount > 0) {
      await pool.query('DELETE FROM student_share_likes WHERE share_id=$1 AND student_id=$2', [req.params.id, req.user.id]);
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO student_share_likes (share_id, student_id) VALUES ($1,$2)', [req.params.id, req.user.id]);
      res.json({ liked: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/user/:userId', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  const viewerId = req.user.id;
  const viewerRole = req.user.role;
  if (Number.isNaN(targetId)) return res.status(400).json({ error: 'Invalid user.' });

  if (viewerRole === 'student' && targetId !== viewerId) {
    try {
      const sub = await pool.query(
        'SELECT 1 FROM subscriptions WHERE subscriber_id = $1 AND target_id = $2',
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
      `SELECT s.id, s.student_id, s.type, s.content, s.created_at, s.pinned,
              s.school, s.class_name, s.teacher_name, s.status, s.review_note,
              u.name AS student_name,
              COUNT(l.student_id)::int AS like_count,
              BOOL_OR(l.student_id = $2) AS liked_by_me
       FROM student_shares s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN student_share_likes l ON l.share_id = s.id
       WHERE s.student_id = $1
         AND (
           s.status = 'approved'
           OR s.student_id = $2
           OR $3 IN ('teacher', 'admin', 'head_teacher', 'parent')
         )
       GROUP BY s.id, u.name
       ORDER BY s.pinned DESC, s.created_at DESC
       LIMIT 100`,
      [targetId, viewerId, viewerRole]
    );
    res.json(shares.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:id', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const del = await pool.query(
      'DELETE FROM student_shares WHERE id=$1 AND student_id=$2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (del.rowCount === 0) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
