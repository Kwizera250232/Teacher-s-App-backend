const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const auth = authenticateToken;

// ── Rate limiters ────────────────────────────────────────────────────────────
const avatarLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many uploads, try again later.' } });
const subscribeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: 'Too many requests, slow down.' } });

// â”€â”€ Ensure upload directory exists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const uploadDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const safeArray = (val) => Array.isArray(val) ? val : [];

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// â”€â”€ Avatar upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!file.mimetype.startsWith('image/') || !ALLOWED_EXT.includes(ext)) {
      return cb(new Error('Invalid file type. Only jpg, jpeg, png, gif, webp allowed.'));
    }
    cb(null, true);
  },
});

// â”€â”€ Input validation helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function validateProfileInput({ phone, home_address, dreams, fears }) {
  if (phone && phone.length > 25) return 'Phone number too long (max 25 chars).';
  if (home_address && home_address.length > 200) return 'Address too long (max 200 chars).';
  if (dreams && dreams.length > 1000) return 'Dreams text too long (max 1000 chars).';
  if (fears && fears.length > 1000) return 'Fears text too long (max 1000 chars).';
  return null;
}

// â”€â”€ GET /api/profile/me â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role,
              p.avatar_path, p.phone, p.home_address, p.schools,
              p.dreams, p.favorite_lessons, p.hobbies, p.fears,
              (SELECT COUNT(*) FROM subscriptions WHERE target_id = u.id) AS subscriber_count,
              (SELECT COUNT(*) FROM subscriptions WHERE subscriber_id = u.id) AS following_count
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

// â”€â”€ GET /api/profile/contacts/list  (MUST be before /:id) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ GET /api/profile/:id  (view another user's profile) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/:id', auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (Number.isNaN(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });

    // Allow only if they share a class (or requester is admin)
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
              p.avatar_path, p.dreams, p.favorite_lessons, p.hobbies,
              p.phone, p.home_address, p.schools, p.fears,
              (SELECT COUNT(*) FROM subscriptions WHERE target_id = u.id) AS subscriber_count,
              EXISTS(SELECT 1 FROM subscriptions WHERE subscriber_id = $1 AND target_id = u.id) AS i_subscribed
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $2`,
      [req.user.id, targetId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// â”€â”€ PUT /api/profile/me  â€” update profile fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.put('/me', auth, async (req, res) => {
  const { phone, home_address, schools, dreams, favorite_lessons, hobbies, fears } = req.body;

  const validationError = validateProfileInput({ phone, home_address, dreams, fears });
  if (validationError) return res.status(400).json({ error: validationError });

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
      [
        req.user.id,
        phone ? phone.trim().slice(0, 25) : null,
        home_address ? home_address.trim().slice(0, 200) : null,
        JSON.stringify(safeArray(schools).slice(0, 20)),
        dreams ? dreams.trim().slice(0, 1000) : null,
        JSON.stringify(safeArray(favorite_lessons).slice(0, 20)),
        JSON.stringify(safeArray(hobbies).slice(0, 20)),
        fears ? fears.trim().slice(0, 1000) : null,
      ]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// â”€â”€ POST /api/profile/me/avatar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/me/avatar', auth, avatarLimiter, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  try {
    // Delete old avatar file before saving new one
    const old = await pool.query('SELECT avatar_path FROM user_profiles WHERE user_id=$1', [req.user.id]);
    if (old.rows[0]?.avatar_path) {
      const oldFilePath = path.join(__dirname, '..', old.rows[0].avatar_path);
      fs.unlink(oldFilePath, () => {}); // ignore errors if file missing
    }
    await pool.query(
      `INSERT INTO user_profiles (user_id, avatar_path, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id) DO UPDATE SET avatar_path = EXCLUDED.avatar_path, updated_at = NOW()`,
      [req.user.id, avatarPath]
    );
    res.json({ avatar_path: avatarPath });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// â”€â”€ POST /api/profile/:id/subscribe  â€” atomic toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/:id/subscribe', auth, subscribeLimiter, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (Number.isNaN(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot subscribe to yourself.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT 1 FROM subscriptions WHERE subscriber_id=$1 AND target_id=$2',
      [req.user.id, targetId]
    );
    if (existing.rowCount) {
      await client.query(
        'DELETE FROM subscriptions WHERE subscriber_id=$1 AND target_id=$2',
        [req.user.id, targetId]
      );
    } else {
      await client.query(
        'INSERT INTO subscriptions (subscriber_id, target_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.user.id, targetId]
      );
    }

    const count = await client.query(
      'SELECT COUNT(*) FROM subscriptions WHERE target_id=$1',
      [targetId]
    );
    await client.query('COMMIT');

    res.json({ subscribed: !existing.rowCount, subscriber_count: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error('Subscribe error:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
