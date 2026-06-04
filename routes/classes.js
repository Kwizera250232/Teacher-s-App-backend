const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanAccessClass, userCanManageClass } = require('../lib/classAccess');
const { ensureQuizShareSchema } = require('../lib/quizShares');
const { ensureClassImageSchema } = require('../lib/classImages');
const { ensureUploadsRoot } = require('../lib/uploads');

const router = express.Router();

ensureClassImageSchema().catch((e) => console.error('[classes] image schema', e.message));

const classImageLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many uploads, try again later.' } });
const classImagesDir = path.join(ensureUploadsRoot(), 'class_images');
if (!fs.existsSync(classImagesDir)) fs.mkdirSync(classImagesDir, { recursive: true });

const classImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, classImagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `class_${req.params.id}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Only image files are allowed.'), ok);
  },
}).single('image');

// Secure 6-char alphanumeric class code using crypto
function generateClassCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// Rate limiter for public preview endpoint (prevent brute-force of class codes)
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ugerageje inshuro nyinshi. Gerageza nyuma y\'iminota 15.' },
});

// GET class preview by code — no auth required (for join landing page)
router.get('/preview/:code', previewLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.subject, u.name AS teacher_name,
              u.school_id, s.name AS school_name, s.email_domain
       FROM classes c
       JOIN users u ON c.teacher_id = u.id
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE c.class_code = $1`,
      [req.params.code.toUpperCase()]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid class code. Ask your teacher for the correct code.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET all classes for logged-in teacher or head teacher
router.get('/', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    let result;
    if (req.user.role === 'head_teacher' && req.user.school_id) {
      result = await pool.query(
        `SELECT c.*, COUNT(DISTINCT cm.student_id) AS student_count
         FROM classes c
         LEFT JOIN class_members cm ON c.id = cm.class_id
         JOIN users t ON t.id = c.teacher_id
         WHERE t.school_id = $1
            OR c.teacher_id = $2
            OR EXISTS (SELECT 1 FROM class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = $2)
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
        [req.user.school_id, req.user.id]
      );
    } else {
      result = await pool.query(
        `SELECT c.*, COUNT(cm.student_id) AS student_count
         FROM classes c
         LEFT JOIN class_members cm ON c.id = cm.class_id
         WHERE c.teacher_id = $1
            OR EXISTS (SELECT 1 FROM class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = $1)
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

async function teacherGuestMarksQuery(user, classId = null) {
  const params = [user.id];
  let classFilter = '';
  if (classId) {
    params.push(classId);
    classFilter = ` AND c.id = $${params.length}`;
  }

  let scopeSql;
  if (user.role === 'head_teacher' && user.school_id) {
    params.push(user.school_id);
    scopeSql = `(c.teacher_id = $1 OR t.school_id = $${params.length})`;
  } else {
    scopeSql = `(c.teacher_id = $1 OR EXISTS (
      SELECT 1 FROM class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = $1
    ))`;
  }

  const result = await pool.query(
    `SELECT qa.id AS attempt_id, qa.score, qa.total, qa.attempted_at,
            u.id AS guest_id, u.name AS guest_name, u.email AS guest_email,
            qz.id AS quiz_id, qz.title AS quiz_title,
            c.id AS class_id, c.name AS class_name, c.subject AS class_subject,
            t.name AS teacher_name,
            gca.granted_via_quiz_id,
            (SELECT qs.share_token FROM quiz_shares qs
             WHERE qs.quiz_id = qz.id AND qs.sharer_id = c.teacher_id
             ORDER BY qs.created_at DESC LIMIT 1) AS share_token
     FROM quiz_attempts qa
     JOIN users u ON u.id = qa.student_id
     JOIN quizzes qz ON qz.id = qa.quiz_id
     JOIN classes c ON c.id = qz.class_id
     JOIN users t ON t.id = c.teacher_id
     LEFT JOIN guest_class_access gca ON gca.user_id = u.id AND gca.class_id = c.id
     WHERE COALESCE(qa.is_guest, FALSE) = TRUE
       AND u.role = 'guest'
       AND ${scopeSql}
       ${classFilter}
     ORDER BY qa.attempted_at DESC
     LIMIT 500`,
    params
  );
  return result.rows;
}

// GET guest quiz marks for teacher / HT (from share-link guests)
router.get('/guest-marks', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    await ensureQuizShareSchema();
    const rows = await teacherGuestMarksQuery(req.user);
    res.json(rows);
  } catch (err) {
    console.error('[classes/guest-marks]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:classId/guest-marks', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  try {
    await ensureQuizShareSchema();
    const rows = await teacherGuestMarksQuery(req.user, classId);
    res.json(rows);
  } catch (err) {
    console.error('[classes/:id/guest-marks]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET classes joined by student
router.get('/my', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS teacher_name
       FROM classes c
       JOIN class_members cm ON c.id = cm.class_id
       JOIN users u ON c.teacher_id = u.id
       WHERE cm.student_id = $1
       ORDER BY cm.joined_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create class (teacher or head teacher)
router.post('/', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const name = (req.body.name || '').trim();
  const subject = (req.body.subject || '').trim();
  if (!name) return res.status(400).json({ error: 'Class name is required.' });
  if (name.length > 150) return res.status(400).json({ error: 'Class name is too long.' });
  if (subject.length > 150) return res.status(400).json({ error: 'Subject name is too long.' });
  try {
    let code;
    let unique = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      code = generateClassCode();
      const exists = await pool.query('SELECT id FROM classes WHERE class_code = $1', [code]);
      if (exists.rows.length === 0) { unique = true; break; }
    }
    if (!unique) return res.status(500).json({ error: 'Could not generate a unique class code. Try again.' });
    const result = await pool.query(
      'INSERT INTO classes (name, subject, teacher_id, class_code) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, subject || null, req.user.id, code]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST join class by code (student)
router.post('/join', authenticateToken, requireRole('student'), async (req, res) => {
  const { class_code } = req.body;
  if (!class_code) return res.status(400).json({ error: 'Class code is required.' });
  try {
    const classResult = await pool.query('SELECT * FROM classes WHERE class_code = $1', [class_code.toUpperCase()]);
    if (classResult.rows.length === 0) return res.status(404).json({ error: 'Class not found. Check the code and try again.' });
    const cls = classResult.rows[0];
    await pool.query(
      'INSERT INTO class_members (class_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [cls.id, req.user.id]
    );
    res.json({ message: 'Joined class successfully!', class: cls });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET single class details — teacher must own it, student must be a member
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS teacher_name FROM classes c JOIN users u ON c.teacher_id = u.id WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Class not found.' });
    const cls = result.rows[0];

    const access = await userCanAccessClass(req.user, cls.id);
    if (!access.ok && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    res.json(cls);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET students in a class — teacher must own the class
router.get('/:id/students', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const manage = await userCanManageClass(req.user, parseInt(req.params.id, 10));
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, cm.joined_at, s.name AS school_name
       FROM class_members cm JOIN users u ON cm.student_id = u.id
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE cm.class_id = $1 ORDER BY cm.joined_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET classmates — accessible to any member of the class (student or teacher)
router.get('/:id/classmates', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.id);
  try {
    // Verify requester is a member or the teacher
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

    // Return all members (students + teacher) with avatar + subscription info
    const result = await pool.query(
      `SELECT u.id, u.name, u.role, u.email, cm.joined_at,
              p.avatar_path, p.dreams, p.favorite_lessons, p.hobbies, p.fears,
              p.phone, p.home_address, p.schools,
              (SELECT COUNT(*) FROM subscriptions WHERE target_id = u.id) AS subscriber_count,
              EXISTS(SELECT 1 FROM subscriptions WHERE subscriber_id = $2 AND target_id = u.id) AS i_subscribed
       FROM class_members cm
       JOIN users u ON cm.student_id = u.id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE cm.class_id = $1
       UNION
       SELECT u.id, u.name, u.role, u.email, c.created_at AS joined_at,
              p.avatar_path, p.dreams, p.favorite_lessons, p.hobbies, p.fears,
              p.phone, p.home_address, p.schools,
              (SELECT COUNT(*) FROM subscriptions WHERE target_id = u.id) AS subscriber_count,
              EXISTS(SELECT 1 FROM subscriptions WHERE subscriber_id = $2 AND target_id = u.id) AS i_subscribed
       FROM classes c
       JOIN users u ON u.id = c.teacher_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE c.id = $1
       ORDER BY name`,
      [classId, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /:id/students/:studentId — teacher removes a student from class
router.delete('/:id/students/:studentId', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = parseInt(req.params.id);
  const studentId = parseInt(req.params.studentId);
  if (Number.isNaN(classId) || Number.isNaN(studentId)) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const cls = await pool.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
    if (!cls.rowCount) return res.status(404).json({ error: 'Class not found.' });
    if (cls.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
    // Delete the user account entirely so they can re-register with the same email.
    // ON DELETE CASCADE will remove all class_members rows automatically.
    await pool.query("DELETE FROM users WHERE id=$1 AND role='student'", [studentId]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /:id/students — teacher adds a student by email
router.post('/:id/students', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = parseInt(req.params.id);
  const { email } = req.body;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email is required.' });
  try {
    const cls = await pool.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
    if (!cls.rowCount) return res.status(404).json({ error: 'Class not found.' });
    if (cls.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

    const user = await pool.query(`SELECT id, name FROM users WHERE email=$1 AND role='student'`, [email.trim().toLowerCase()]);
    if (!user.rowCount) return res.status(404).json({ error: 'No student found with that email.' });

    await pool.query(
      'INSERT INTO class_members (class_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [classId, user.rows[0].id]
    );
    res.json({ ok: true, student: user.rows[0] });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Staff: invite another teacher to same school
router.post('/school/teacher-invite-link', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const crypto = require('crypto');
  if (!req.user.school_id) {
    return res.status(400).json({ error: 'Your account is not linked to a school yet.' });
  }
  try {
    const token = crypto.randomBytes(22).toString('hex');
    await pool.query(
      `INSERT INTO invite_tokens (token, role, school_id, creator_id, expires_at)
       VALUES ($1,'teacher',$2,$3,NOW() + INTERVAL '14 days')`,
      [token, req.user.school_id, req.user.id]
    );
    const frontendUrl = process.env.FRONTEND_URL || 'https://student.umunsi.com';
    res.json({ invite_link: `${frontendUrl}/invite?token=${token}` });
  } catch (err) {
    console.error('[teacher-invite-link]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

async function uploadClassImage(req, res, column) {
  const classId = parseInt(req.params.id, 10);
  if (!classId) return res.status(400).json({ error: 'Invalid class id.' });
  if (!req.file) return res.status(400).json({ error: 'Image file is required.' });

  try {
    await ensureClassImageSchema();
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const imagePath = `/uploads/class_images/${req.file.filename}`;
    const prev = await pool.query(`SELECT ${column} FROM classes WHERE id = $1`, [classId]);
    if (!prev.rows.length) return res.status(404).json({ error: 'Class not found.' });

    const oldPath = prev.rows[0][column];
    if (oldPath) {
      const oldFile = path.join(__dirname, '..', String(oldPath).replace(/^\//, ''));
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }

    const updated = await pool.query(
      `UPDATE classes SET ${column} = $1 WHERE id = $2 RETURNING id, name, subject, class_code, avatar_path, cover_path, teacher_id, created_at`,
      [imagePath, classId]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(`[classes/${column}]`, err);
    res.status(500).json({ error: 'Failed to upload image.' });
  }
}

router.post('/:id/avatar', authenticateToken, requireRole('teacher', 'head_teacher'), classImageLimiter, (req, res) => {
  classImageUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    uploadClassImage(req, res, 'avatar_path');
  });
});

router.post('/:id/cover', authenticateToken, requireRole('teacher', 'head_teacher'), classImageLimiter, (req, res) => {
  classImageUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    uploadClassImage(req, res, 'cover_path');
  });
});

module.exports = router;

