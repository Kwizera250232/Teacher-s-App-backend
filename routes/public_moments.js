const express = require('express');
const pool = require('../db');
const { ensureClassMomentSharesSchema, sharePreviewFromMoment } = require('../lib/classMomentShares');

const router = express.Router();

router.get('/moments/:token', async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token || token.length < 16) {
    return res.status(400).json({ error: 'Invalid link.' });
  }
  try {
    await ensureClassMomentSharesSchema();
    const row = await pool.query(
      `SELECT s.share_token, s.created_at AS shared_at, sh.name AS sharer_name,
              m.*, u.name AS teacher_name, c.name AS class_name,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', i.id, 'file_path', i.file_path, 'sort_order', i.sort_order
                ) ORDER BY i.sort_order, i.id)
                 FROM class_moment_images i WHERE i.moment_id = m.id),
                '[]'::json
              ) AS images
       FROM class_moment_shares s
       JOIN class_moments m ON m.id = s.moment_id
       JOIN users u ON u.id = m.teacher_id
       JOIN classes c ON c.id = m.class_id
       JOIN users sh ON sh.id = s.sharer_id
       WHERE s.share_token = $1
       LIMIT 1`,
      [token]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'This link has expired or was removed.' });
    const moment = row.rows[0];
    const { apiPublicBase } = require('../lib/classMomentMediaUrl');
    const preview = sharePreviewFromMoment(moment, apiPublicBase(), token);
    res.json({
      share_token: token,
      shared_at: moment.shared_at,
      sharer_name: moment.sharer_name,
      moment_id: moment.id,
      class_name: moment.class_name,
      teacher_name: moment.teacher_name,
      published_at: moment.published_at,
      ...preview,
      images: moment.images,
      photo_count: preview.preview_images?.length || 0,
    });
  } catch (err) {
    console.error('[public/moments]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/public/stats — live platform counters for the landing page
// (teachers, students, app installs). Counts only — no personal data.
router.get('/stats', async (req, res) => {
  try {
    const [teachers, students, installs, schools, classes] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role IN ('teacher','head_teacher') AND is_approved=TRUE"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='student'"),
      pool.query('SELECT COUNT(*) FROM pwa_installs').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) FROM schools').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) FROM classes').catch(() => ({ rows: [{ count: 0 }] })),
    ]);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      teachers: parseInt(teachers.rows[0].count, 10),
      students: parseInt(students.rows[0].count, 10),
      installs: parseInt(installs.rows[0].count, 10),
      schools: parseInt(schools.rows[0].count, 10),
      classes: parseInt(classes.rows[0].count, 10),
    });
  } catch (err) {
    console.error('[public/stats]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
