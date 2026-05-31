const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const STATUS_DAYS = 7;

pool.query(`
  CREATE TABLE IF NOT EXISTS composition_statuses (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_id INTEGER NOT NULL REFERENCES student_shares(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comp_status_student ON composition_statuses(student_id);
  CREATE INDEX IF NOT EXISTS idx_comp_status_expires ON composition_statuses(expires_at);
  CREATE TABLE IF NOT EXISTS composition_status_views (
    status_id INTEGER NOT NULL REFERENCES composition_statuses(id) ON DELETE CASCADE,
    viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (status_id, viewer_id)
  );
`).catch((e) => console.error('[composition_status] migration:', e.message));

function parseCompositionPreview(content) {
  const lines = String(content || '').split('\n');
  const title = lines[0]?.replace(/^📌\s*/, '') || 'Composition';
  let intro = '';
  let section = null;
  const buf = [];
  for (const line of lines.slice(1)) {
    if (line === '📖 Introduction') {
      if (section === 'intro') intro = buf.join('\n').trim();
      section = 'intro';
      buf.length = 0;
    } else if (line === '📝 Body' || line === '🏁 Conclusion') {
      if (section === 'intro' && !intro) intro = buf.join('\n').trim();
      section = 'other';
      buf.length = 0;
    } else {
      buf.push(line);
    }
  }
  if (section === 'intro' && !intro) intro = buf.join('\n').trim();
  return { title, intro: intro.slice(0, 280) };
}

async function statusRowQuery(extraWhere = '', params = []) {
  return pool.query(
    `SELECT cs.*, s.content, s.type, s.status AS share_status,
            u.name AS student_name, u.school_id,
            (SELECT COUNT(*)::int FROM composition_status_views v WHERE v.status_id = cs.id) AS view_count
     FROM composition_statuses cs
     JOIN student_shares s ON s.id = cs.share_id
     JOIN users u ON u.id = cs.student_id
     WHERE cs.expires_at > NOW() ${extraWhere}
     ORDER BY cs.created_at DESC`,
    params
  );
}

/** Student: active status + view count */
router.get('/mine', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await statusRowQuery('AND cs.student_id = $1', [req.user.id]);
    const row = result.rows[0];
    if (!row) return res.json({ active: null });
    const preview = parseCompositionPreview(row.content);
    const viewers = await pool.query(
      `SELECT v.viewed_at, u.name AS viewer_name, u.role AS viewer_role
       FROM composition_status_views v
       JOIN users u ON u.id = v.viewer_id
       WHERE v.status_id = $1
       ORDER BY v.viewed_at DESC
       LIMIT 50`,
      [row.id]
    );
    res.json({
      active: {
        ...row,
        title: preview.title,
        intro: preview.intro,
        expires_in_days: Math.max(0, Math.ceil((new Date(row.expires_at) - Date.now()) / 86400000)),
        viewers: viewers.rows,
      },
    });
  } catch (err) {
    console.error('[composition_status/mine]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** Student: approved compositions to pick for status */
router.get('/pickable-shares', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, content, created_at, status
       FROM student_shares
       WHERE student_id = $1 AND type = 'composition' AND status = 'approved'
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json(
      result.rows.map((r) => ({
        ...r,
        ...parseCompositionPreview(r.content),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** Student: publish status from approved share (7 days) */
router.post('/', authenticateToken, requireRole('student'), async (req, res) => {
  const shareId = parseInt(req.body.share_id, 10);
  if (!Number.isFinite(shareId)) return res.status(400).json({ error: 'share_id required.' });
  try {
    const share = await pool.query(
      `SELECT id, student_id, status, type FROM student_shares WHERE id = $1 AND student_id = $2`,
      [shareId, req.user.id]
    );
    if (!share.rows.length) return res.status(404).json({ error: 'Composition not found.' });
    if (share.rows[0].type !== 'composition') return res.status(400).json({ error: 'Only compositions can be posted as status.' });
    if (share.rows[0].status !== 'approved') {
      return res.status(400).json({
        error: 'Composition must be approved first. Finish writing on your Profile, then try again.',
        needs_profile: true,
      });
    }

    const userRow = await pool.query('SELECT school_id FROM users WHERE id = $1', [req.user.id]);
    const schoolId = userRow.rows[0]?.school_id || null;
    const classRow = await pool.query(
      `SELECT class_id FROM class_members WHERE student_id = $1 LIMIT 1`,
      [req.user.id]
    );
    const classId = classRow.rows[0]?.class_id || null;

    await pool.query(
      `UPDATE composition_statuses SET expires_at = NOW() WHERE student_id = $1 AND expires_at > NOW()`,
      [req.user.id]
    );

    const expires = new Date(Date.now() + STATUS_DAYS * 86400000);
    const ins = await pool.query(
      `INSERT INTO composition_statuses (student_id, share_id, school_id, class_id, expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, shareId, schoolId, classId, expires]
    );
    const payload = await statusRowQuery('AND cs.id = $1', [ins.rows[0].id]);
    const row = payload.rows[0];
    const preview = parseCompositionPreview(row.content);
    res.status(201).json({
      active: {
        ...row,
        title: preview.title,
        intro: preview.intro,
        expires_in_days: STATUS_DAYS,
        viewers: [],
      },
    });
  } catch (err) {
    console.error('[composition_status POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** Record a view (not owner) */
router.post('/:id/view', authenticateToken, async (req, res) => {
  const statusId = parseInt(req.params.id, 10);
  if (!Number.isFinite(statusId)) return res.status(400).json({ error: 'Invalid status.' });
  try {
    const st = await pool.query(
      `SELECT student_id FROM composition_statuses WHERE id = $1 AND expires_at > NOW()`,
      [statusId]
    );
    if (!st.rows.length) return res.status(404).json({ error: 'Status not found or expired.' });
    if (st.rows[0].student_id === req.user.id) {
      return res.json({ recorded: false, reason: 'owner' });
    }
    await pool.query(
      `INSERT INTO composition_status_views (status_id, viewer_id) VALUES ($1,$2)
       ON CONFLICT (status_id, viewer_id) DO UPDATE SET viewed_at = NOW()`,
      [statusId, req.user.id]
    );
    const count = await pool.query(
      'SELECT COUNT(*)::int AS c FROM composition_status_views WHERE status_id = $1',
      [statusId]
    );
    res.json({ recorded: true, view_count: count.rows[0].c });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** Teachers: statuses in a class */
router.get('/class/:classId', authenticateToken, async (req, res) => {
  if (!['teacher', 'head_teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const classId = parseInt(req.params.classId, 10);
  try {
    const result = await pool.query(
      `SELECT cs.*, s.content, u.name AS student_name,
              (SELECT COUNT(*)::int FROM composition_status_views v WHERE v.status_id = cs.id) AS view_count
       FROM composition_statuses cs
       JOIN student_shares s ON s.id = cs.share_id
       JOIN users u ON u.id = cs.student_id
       JOIN class_members cm ON cm.student_id = cs.student_id AND cm.class_id = $1
       WHERE cs.expires_at > NOW()
       ORDER BY cs.created_at DESC`,
      [classId]
    );
    res.json(
      result.rows.map((r) => ({
        ...r,
        ...parseCompositionPreview(r.content),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** Head teacher / staff: school-wide active statuses */
router.get('/school', authenticateToken, async (req, res) => {
  if (!['teacher', 'head_teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  try {
    const schoolId = req.user.role === 'admin'
      ? parseInt(req.query.school_id, 10) || null
      : (await pool.query('SELECT school_id FROM users WHERE id = $1', [req.user.id])).rows[0]?.school_id;
    if (!schoolId) return res.json([]);
    const result = await pool.query(
      `SELECT cs.*, s.content, u.name AS student_name,
              (SELECT COUNT(*)::int FROM composition_status_views v WHERE v.status_id = cs.id) AS view_count
       FROM composition_statuses cs
       JOIN student_shares s ON s.id = cs.share_id
       JOIN users u ON u.id = cs.student_id
       WHERE cs.expires_at > NOW() AND u.school_id = $1
       ORDER BY cs.created_at DESC
       LIMIT 100`,
      [schoolId]
    );
    res.json(
      result.rows.map((r) => ({
        ...r,
        ...parseCompositionPreview(r.content),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
