const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const auth = [authenticateToken, requireRole('teacher', 'head_teacher', 'admin')];

// GET /api/teachers — directory of every approved teacher/head teacher on the app.
// Same-school colleagues first, then everyone else. Used by Teacher Connect.
router.get('/', auth, async (req, res) => {
  try {
    const me = await pool.query('SELECT school_id FROM users WHERE id=$1', [req.user.id]);
    const mySchool = me.rows[0]?.school_id || null;
    const r = await pool.query(
      `SELECT u.id, u.name, u.role, u.email, u.phone, u.avatar_path,
              s.name AS school_name,
              ($2::int IS NOT NULL AND u.school_id = $2) AS same_school
         FROM users u
         LEFT JOIN schools s ON s.id = u.school_id
        WHERE u.role IN ('teacher','head_teacher')
          AND u.is_approved = TRUE
          AND u.id <> $1
        ORDER BY same_school DESC, s.name NULLS LAST, u.name`,
      [req.user.id, mySchool]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
