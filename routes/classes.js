const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

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
      `SELECT c.id, c.name, c.subject, u.name AS teacher_name
       FROM classes c JOIN users u ON c.teacher_id = u.id
       WHERE c.class_code = $1`,
      [req.params.code.toUpperCase()]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid class code. Ask your teacher for the correct code.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET all classes for logged-in teacher
router.get('/', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(cm.student_id) AS student_count
       FROM classes c
       LEFT JOIN class_members cm ON c.id = cm.class_id
       WHERE c.teacher_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
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

// POST create class (teacher)
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
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

    if (req.user.role === 'teacher') {
      if (cls.teacher_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
    } else if (req.user.role === 'student') {
      const member = await pool.query(
        'SELECT 1 FROM class_members WHERE class_id=$1 AND student_id=$2',
        [cls.id, req.user.id]
      );
      if (member.rows.length === 0) return res.status(403).json({ error: 'Forbidden.' });
    }
    // admin may view any class — no extra check needed

    res.json(cls);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET students in a class — teacher must own the class
router.get('/:id/students', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const classCheck = await pool.query('SELECT teacher_id FROM classes WHERE id=$1', [req.params.id]);
    if (classCheck.rows.length === 0) return res.status(404).json({ error: 'Class not found.' });
    if (classCheck.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

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
    const access = await pool.query(
      `SELECT 1 FROM class_members WHERE class_id=$1 AND student_id=$2
       UNION
       SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2`,
      [classId, req.user.id]
    );
    if (!access.rowCount) return res.status(403).json({ error: 'Forbidden.' });

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
    await pool.query('DELETE FROM class_members WHERE class_id=$1 AND student_id=$2', [classId, studentId]);
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

module.exports = router;

