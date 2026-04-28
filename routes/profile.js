const express = require('express');
const path = require('path');
const multer = require('multer');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const auth = authenticateToken;

// ── Avatar upload ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/avatars'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

// GET /api/profile/me
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role,
              p.avatar_path, p.phone, p.home_address, p.schools,
              p.dreams, p.favorite_lessons, p.hobbies, p.fears
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0] || {});
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/profile/:id  (view another user's profile — classmates / teacher)
router.get('/:id', auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    // Allow only if they share a class
    const shared = await pool.query(
      `SELECT 1 FROM class_members cm1
       JOIN class_members cm2 ON cm1.class_id = cm2.class_id
       WHERE cm1.student_id = $1 AND cm2.student_id = $2
       UNION
       SELECT 1 FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       WHERE (cm.student_id = $1 AND c.teacher_id = $2)
          OR (cm.student_id = $2 AND c.teacher_id = $1)`,
      [req.user.id, targetId]
    );
    if (!shared.rowCount && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not in the same class.' });
    }
    const result = await pool.query(
      `SELECT u.id, u.name, u.role,
              p.avatar_path, p.dreams, p.favorite_lessons, p.hobbies
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [targetId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/profile/me  — update profile fields
router.put('/me', auth, async (req, res) => {
  const { phone, home_address, schools, dreams, favorite_lessons, hobbies, fears } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_profiles (user_id, phone, home_address, schools, dreams, favorite_lessons, hobbies, fears, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         phone = EXCLUDED.phone,
         home_address = EXCLUDED.home_address,
         schools = EXCLUDED.schools,
         dreams = EXCLUDED.dreams,
         favorite_lessons = EXCLUDED.favorite_lessons,
         hobbies = EXCLUDED.hobbies,
         fears = EXCLUDED.fears,
         updated_at = NOW()`,
      [req.user.id, phone || null, home_address || null,
       JSON.stringify(schools || []),
       dreams || null,
       JSON.stringify(favorite_lessons || []),
       JSON.stringify(hobbies || []),
       fears || null]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/profile/me/avatar
router.post('/me/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  try {
    await pool.query(
      `INSERT INTO user_profiles (user_id, avatar_path, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id) DO UPDATE SET avatar_path = EXCLUDED.avatar_path, updated_at = NOW()`,
      [req.user.id, avatarPath]
    );
    res.json({ avatar_path: avatarPath });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/profile/contacts/list  — list people I can message (classmates + teachers)
router.get('/contacts/list', auth, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'student') {
      const result = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.role, p.avatar_path
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.id != $1 AND (
           u.id IN (
             SELECT cm2.student_id FROM class_members cm1
             JOIN class_members cm2 ON cm1.class_id = cm2.class_id
             WHERE cm1.student_id = $1 AND cm2.student_id != $1
           )
           OR u.id IN (
             SELECT c.teacher_id FROM class_members cm
             JOIN classes c ON c.id = cm.class_id
             WHERE cm.student_id = $1
           )
         )
         ORDER BY u.name`,
        [req.user.id]
      );
      rows = result.rows;
    } else if (req.user.role === 'teacher') {
      const result = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.role, p.avatar_path
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.id != $1 AND u.id IN (
           SELECT cm.student_id FROM classes c
           JOIN class_members cm ON cm.class_id = c.id
           WHERE c.teacher_id = $1
         )
         ORDER BY u.name`,
        [req.user.id]
      );
      rows = result.rows;
    } else {
      rows = [];
    }
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
