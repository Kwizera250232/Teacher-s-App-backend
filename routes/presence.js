const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { ensurePresenceSchema } = require('../lib/presenceSchema');
const { resolveSchoolIdForUser } = require('../lib/classMomentsDiscover');

const router = express.Router();

ensurePresenceSchema().catch((e) => console.error('[presence] schema:', e.message));

router.post('/ping', authenticateToken, async (req, res) => {
  try {
    await ensurePresenceSchema();
    await pool.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ ok: true, at: new Date().toISOString() });
  } catch (err) {
    console.error('[presence/ping]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/online', authenticateToken, async (req, res) => {
  try {
    await ensurePresenceSchema();
    const schoolId = await resolveSchoolIdForUser(req.user);
    if (!schoolId) return res.json({ school_id: null, online: [] });

    const rows = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.role, p.avatar_path AS avatar_path, u.last_seen_at
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id != $2
         AND u.last_seen_at >= NOW() - INTERVAL '2 minutes'
         AND u.role IN ('student', 'teacher', 'head_teacher', 'parent')
         AND (
           u.school_id = $1
           OR EXISTS (
             SELECT 1 FROM class_members cm
             JOIN classes c ON c.id = cm.class_id
             JOIN users tc ON tc.id = c.teacher_id
             WHERE cm.student_id = u.id AND tc.school_id = $1
           )
           OR EXISTS (
             SELECT 1 FROM parent_children pc
             JOIN class_members cm ON cm.student_id = pc.student_id
             JOIN classes c ON c.id = cm.class_id
             JOIN users tc ON tc.id = c.teacher_id
             WHERE pc.parent_id = u.id AND tc.school_id = $1
           )
           OR EXISTS (
             SELECT 1 FROM classes c
             JOIN users tc ON tc.id = c.teacher_id
             WHERE c.teacher_id = u.id AND tc.school_id = $1
           )
         )
       ORDER BY u.last_seen_at DESC
       LIMIT 48`,
      [schoolId, req.user.id]
    );
    res.json({ school_id: schoolId, online: rows.rows });
  } catch (err) {
    console.error('[presence/online]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
