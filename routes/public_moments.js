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
    const apiBase = process.env.API_PUBLIC_URL || 'https://studentapi.umunsi.com';
    const preview = sharePreviewFromMoment(moment, apiBase);
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
    });
  } catch (err) {
    console.error('[public/moments]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
