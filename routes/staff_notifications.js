const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const STAFF_ROLES = ['teacher', 'head_teacher'];

router.get('/notifications', authenticateToken, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT id, type, title, body, payload, is_read, created_at
       FROM user_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 80`,
      [req.user.id]
    );
    const unread = rows.rows.filter((r) => !r.is_read).length;
    res.json({ unread_count: unread, notifications: rows.rows });
  } catch (err) {
    console.error('[staff/notifications]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/notifications/:id/read', authenticateToken, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    await pool.query(
      'UPDATE user_notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/notifications/read-all', authenticateToken, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    await pool.query(
      'UPDATE user_notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
