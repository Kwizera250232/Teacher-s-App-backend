const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = [authenticateToken, requireRole('admin')];

async function ensureCatBoardTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cat_mark_sheets (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(80) NOT NULL,
      lesson_title VARCHAR(255),
      lesson_topic VARCHAR(255),
      cat_count INTEGER NOT NULL DEFAULT 10,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (class_id, teacher_id, subject)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cat_student_marks (
      id SERIAL PRIMARY KEY,
      sheet_id INTEGER NOT NULL REFERENCES cat_mark_sheets(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cat_1 NUMERIC(5,2),
      cat_2 NUMERIC(5,2),
      cat_3 NUMERIC(5,2),
      cat_4 NUMERIC(5,2),
      cat_5 NUMERIC(5,2),
      cat_6 NUMERIC(5,2),
      cat_7 NUMERIC(5,2),
      cat_8 NUMERIC(5,2),
      cat_9 NUMERIC(5,2),
      cat_10 NUMERIC(5,2),
      total NUMERIC(6,2) NOT NULL DEFAULT 0,
      percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (sheet_id, student_id)
    )
  `);
}

// ─── ADMIN IMPERSONATION (View as Teacher/Student) ─────────────────────────
router.post('/impersonate', ...adminOnly, async (req, res) => {
  const targetId = parseInt(req.body.user_id, 10);
  if (!targetId) return res.status(400).json({ error: 'Valid user_id is required.' });

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, school_id, is_suspended
       FROM users
       WHERE id = $1`,
      [targetId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const target = result.rows[0];
    if (!['teacher', 'student'].includes(target.role)) {
      return res.status(400).json({ error: 'You can only view teacher or student accounts.' });
    }
    if (target.is_suspended) {
      return res.status(403).json({ error: 'This account is suspended.' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration: JWT secret missing.' });
    }

    const token = jwt.sign(
      {
        id: target.id,
        role: target.role,
        impersonated_by: req.user.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      token,
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
        school_id: target.school_id,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
router.get('/stats', ...adminOnly, async (req, res) => {
  try {
    const [schools, teachers, students, classes, quizzes, homework, pending, installs] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM schools"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher' AND is_approved=TRUE"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='student'"),
      pool.query("SELECT COUNT(*) FROM classes"),
      pool.query("SELECT COUNT(*) FROM quizzes"),
      pool.query("SELECT COUNT(*) FROM homework"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher' AND is_approved=FALSE"),
      pool.query("SELECT COUNT(*) FROM pwa_installs"),
    ]);
    res.json({
      schools: parseInt(schools.rows[0].count),
      teachers: parseInt(teachers.rows[0].count),
      students: parseInt(students.rows[0].count),
      classes: parseInt(classes.rows[0].count),
      quizzes: parseInt(quizzes.rows[0].count),
      homework: parseInt(homework.rows[0].count),
      pending_teachers: parseInt(pending.rows[0].count),
      installations: parseInt(installs.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Daily registrations for activity graph (last 14 days)
router.get('/activity', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── SCHOOLS ──────────────────────────────────────────────────────────────────
router.get('/schools', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, COUNT(DISTINCT u.id) AS user_count
      FROM schools s
      LEFT JOIN users u ON u.school_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/schools', ...adminOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const location = String(req.body.location || '').trim();
  const rawCode = String(req.body.code || '').trim();
  const code = rawCode ? rawCode.toUpperCase() : null;
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (code && !/^[A-Z0-9_-]{4,20}$/.test(code)) {
    return res.status(400).json({ error: 'School code must be 4-20 chars (A-Z, 0-9, _ or -).' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO schools (name, location, code) VALUES ($1,$2,$3) RETURNING *',
      [name, location || null, code]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/schools/:id', ...adminOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const location = String(req.body.location || '').trim();
  const rawCode = String(req.body.code || '').trim();
  const code = rawCode ? rawCode.toUpperCase() : null;
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (code && !/^[A-Z0-9_-]{4,20}$/.test(code)) {
    return res.status(400).json({ error: 'School code must be 4-20 chars (A-Z, 0-9, _ or -).' });
  }
  try {
    const result = await pool.query(
      'UPDATE schools SET name=$1, location=$2, code=$3 WHERE id=$4 RETURNING *',
      [name, location || null, code, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'School not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/schools/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM schools WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── TEACHERS ─────────────────────────────────────────────────────────────────
router.get('/teachers', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.school_id, u.is_suspended, u.is_approved, u.created_at,
             s.name AS school_name,
             COUNT(DISTINCT c.id)  AS class_count,
             COUNT(DISTINCT n.id)  AS notes_count,
             COUNT(DISTINCT h.id)  AS homework_count,
             COUNT(DISTINCT q.id)  AS quiz_count
      FROM users u
      LEFT JOIN schools s        ON u.school_id = s.id
      LEFT JOIN classes c        ON c.teacher_id = u.id
      LEFT JOIN notes n          ON n.class_id   = c.id
      LEFT JOIN homework h       ON h.class_id   = c.id
      LEFT JOIN quizzes q        ON q.class_id   = c.id
      WHERE u.role = 'teacher'
      GROUP BY u.id, s.name ORDER BY u.is_approved ASC, u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[admin/teachers]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/teachers/:id/suspend', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_suspended=$1 WHERE id=$2 AND role=\'teacher\' RETURNING id, name, is_suspended',
      [req.body.suspended, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Teacher not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/teachers/:id/approve', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET is_approved=TRUE WHERE id=$1 AND role='teacher' RETURNING id, name, email, is_approved",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Teacher not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/teachers/:id/school', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET school_id=$1 WHERE id=$2 AND role=\'teacher\' RETURNING id, name, school_id',
      [req.body.school_id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/teachers/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1 AND role=\'teacher\'', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── STUDENTS ─────────────────────────────────────────────────────────────────
router.get('/students', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.is_suspended, u.created_at,
             s.name AS school_name,
             COUNT(DISTINCT cm.class_id) AS class_count
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN class_members cm ON cm.student_id = u.id
      WHERE u.role = 'student'
      GROUP BY u.id, s.name ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[admin/students]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/students/:id/suspend', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_suspended=$1 WHERE id=$2 AND role=\'student\' RETURNING id, name, is_suspended',
      [req.body.suspended, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/students/:id/reset-password', ...adminOnly, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const hashed = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2 AND role=\'student\'', [hashed, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/students/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1 AND role=\'student\'', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── CLASSES ──────────────────────────────────────────────────────────────────
router.get('/classes', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.subject, c.class_code, c.created_at,
             u.name AS teacher_name,
             s.name AS school_name,
             COUNT(cm.student_id) AS student_count
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN class_members cm ON cm.class_id = c.id
      GROUP BY c.id, u.name, s.name ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/classes/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM classes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── CONTENT OVERVIEW ─────────────────────────────────────────────────────────
router.get('/content', ...adminOnly, async (req, res) => {
  try {
    const [notes, hw, quizzes] = await Promise.all([
      pool.query(`SELECT n.id, n.title, n.file_name, n.created_at, c.name AS class_name, u.name AS teacher_name
                  FROM notes n JOIN classes c ON n.class_id=c.id JOIN users u ON c.teacher_id=u.id ORDER BY n.created_at DESC LIMIT 50`),
      pool.query(`SELECT h.id, h.title, h.due_date, h.created_at, c.name AS class_name, u.name AS teacher_name
                  FROM homework h JOIN classes c ON h.class_id=c.id JOIN users u ON c.teacher_id=u.id ORDER BY h.created_at DESC LIMIT 50`),
      pool.query(`SELECT q.id, q.title, q.created_at, c.name AS class_name, u.name AS teacher_name,
                  COUNT(qa.id) AS attempt_count
                  FROM quizzes q JOIN classes c ON q.class_id=c.id JOIN users u ON c.teacher_id=u.id
                  LEFT JOIN quiz_attempts qa ON qa.quiz_id=q.id
                  GROUP BY q.id, c.name, u.name ORDER BY q.created_at DESC LIMIT 50`),
    ]);
    res.json({ notes: notes.rows, homework: hw.rows, quizzes: quizzes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/content/notes/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
router.get('/announcements', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name AS admin_name, s.name AS school_name
      FROM admin_announcements a
      JOIN users u ON a.admin_id = u.id
      LEFT JOIN schools s ON a.school_id = s.id
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/announcements', ...adminOnly, async (req, res) => {
  const { title, message, target, school_id } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required.' });
  try {
    const result = await pool.query(
      'INSERT INTO admin_announcements (admin_id, title, message, target, school_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, title, message, target || 'all', school_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/announcements/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM admin_announcements WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── REPORTS / MESSAGES ───────────────────────────────────────────────────────
router.get('/reports', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM reports r JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/reports/:id/reply', ...adminOnly, async (req, res) => {
  const { reply } = req.body;
  if (!reply) return res.status(400).json({ error: 'Reply is required.' });
  try {
    const result = await pool.query(
      'UPDATE reports SET admin_reply=$1, status=\'resolved\', replied_at=NOW() WHERE id=$2 RETURNING *',
      [reply, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── STUDENT ARTICLE MODERATION ─────────────────────────────────────────────
router.get('/student-shares/pending-count', ...adminOnly, async (req, res) => {
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS count FROM student_shares WHERE status='pending'");
    res.json({ count: r.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/student-shares', ...adminOnly, async (req, res) => {
  const status = (req.query.status || 'pending').toString();
  if (!['pending', 'approved', 'declined', 'all'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const result = await pool.query(
      `SELECT s.id, s.type, s.content, s.status, s.school, s.class_name, s.teacher_name,
              s.created_at, s.review_note, s.reviewed_at,
              u.name AS student_name, u.email AS student_email,
              r.name AS reviewed_by_name
       FROM student_shares s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN users r ON r.id = s.reviewed_by
       WHERE ($1 = 'all' OR s.status = $1)
       ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'declined' THEN 1 ELSE 2 END,
                s.created_at DESC
       LIMIT 300`,
      [status]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/student-shares/:id/moderate', ...adminOnly, async (req, res) => {
  const decision = (req.body.decision || '').toString();
  const reviewNote = (req.body.review_note || '').toString().trim();
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved or declined.' });
  }
  if (decision === 'declined' && !reviewNote) {
    return res.status(400).json({ error: 'Decline reason is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE student_shares
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           review_note = CASE WHEN $1 = 'declined' THEN $3 ELSE NULL END
       WHERE id = $4
       RETURNING id, status, review_note, reviewed_at`,
      [decision, req.user.id, reviewNote || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Article not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── USER-FACING ANNOUNCEMENTS (any authenticated user) ──────────────────────
router.get('/user-announcements', authenticateToken, async (req, res) => {
  try {
    const roleTarget = req.user.role + 's'; // 'teacher' -> 'teachers', 'student' -> 'students'
    const result = await pool.query(`
      SELECT a.id, a.title, a.message, a.target, a.created_at, u.name AS admin_name
      FROM admin_announcements a
      JOIN users u ON a.admin_id = u.id
      WHERE a.target = 'all'
         OR a.target = $1
         OR (a.target = 'school' AND a.school_id = (SELECT school_id FROM users WHERE id = $2))
      ORDER BY a.created_at DESC
    `, [roleTarget, req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
router.get('/settings', ...adminOnly, async (req, res) => {
  try {
    let result = await pool.query('SELECT * FROM platform_settings LIMIT 1');
    if (result.rows.length === 0) {
      result = await pool.query('INSERT INTO platform_settings DEFAULT VALUES RETURNING *');
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/settings', ...adminOnly, async (req, res) => {
  const { platform_name, logo_url } = req.body;
  try {
    const result = await pool.query(
      'UPDATE platform_settings SET platform_name=$1, logo_url=$2, updated_at=NOW() RETURNING *',
      [platform_name, logo_url || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── SCHOOL BOARD (admin/teacher) ───────────────────────────────────────────
router.get('/my-school-board', ...adminOnly, async (req, res) => {
  try {
    await ensureCatBoardTables();

    const requested = parseInt(req.query.school_id, 10);
    if (!Number.isInteger(requested) || requested <= 0) {
      return res.status(400).json({ error: 'school_id is required for admin access.' });
    }
    const schoolId = requested;

    const schoolRes = await pool.query(
      `SELECT id, name, location, code, district, sector, cell, village,
              student_count, head_teacher_name, head_teacher_phone,
              head_teacher_email, welcome_message, created_at
       FROM schools
       WHERE id = $1`,
      [schoolId]
    );
    if (schoolRes.rows.length === 0) return res.status(404).json({ error: 'School not found.' });

    const summaryRes = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher') AS teachers,
         (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'student') AS students,
         (SELECT COUNT(*)::int FROM classes c JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS classes,
         (SELECT COUNT(*)::int FROM notes n JOIN classes c ON c.id = n.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS notes,
         (SELECT COUNT(*)::int FROM homework h JOIN classes c ON c.id = h.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS homework,
         (SELECT COUNT(*)::int FROM quizzes q JOIN classes c ON c.id = q.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS quizzes,
         (SELECT COUNT(*)::int FROM cat_mark_sheets s JOIN classes c ON c.id = s.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS cat_sheets,
         (SELECT COALESCE(ROUND(AVG(m.percentage)::numeric, 2), 0)::float AS value
            FROM cat_student_marks m
            JOIN cat_mark_sheets s ON s.id = m.sheet_id
            JOIN classes c ON c.id = s.class_id
            JOIN users u ON u.id = c.teacher_id
           WHERE u.school_id = $1) AS average_cat_percentage`,
      [schoolId]
    );

    const teachersRes = await pool.query(
      `SELECT u.id, u.name, u.email, u.is_approved, u.is_suspended,
              COUNT(DISTINCT c.id)::int AS classes_count,
              COUNT(DISTINCT n.id)::int AS notes_count,
              COUNT(DISTINCT h.id)::int AS homework_count,
              COUNT(DISTINCT q.id)::int AS quizzes_count,
              COUNT(DISTINCT cms.id)::int AS cat_sheets_count
       FROM users u
       LEFT JOIN classes c ON c.teacher_id = u.id
       LEFT JOIN notes n ON n.class_id = c.id
       LEFT JOIN homework h ON h.class_id = c.id
       LEFT JOIN quizzes q ON q.class_id = c.id
       LEFT JOIN cat_mark_sheets cms ON cms.class_id = c.id
       WHERE u.school_id = $1 AND u.role = 'teacher'
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 120`,
      [schoolId]
    );

    const classesRes = await pool.query(
      `SELECT c.id, c.name, c.subject, c.class_code, c.created_at,
              u.name AS teacher_name,
              COUNT(DISTINCT cm.student_id)::int AS students_count,
              COUNT(DISTINCT n.id)::int AS notes_count,
              COUNT(DISTINCT h.id)::int AS homework_count,
              COUNT(DISTINCT q.id)::int AS quizzes_count,
              COUNT(DISTINCT cms.id)::int AS cat_sheets_count,
              COALESCE(ROUND(AVG(csm.percentage)::numeric, 2), 0)::float AS cat_avg_percentage
       FROM classes c
       JOIN users u ON u.id = c.teacher_id
       LEFT JOIN class_members cm ON cm.class_id = c.id
       LEFT JOIN notes n ON n.class_id = c.id
       LEFT JOIN homework h ON h.class_id = c.id
       LEFT JOIN quizzes q ON q.class_id = c.id
       LEFT JOIN cat_mark_sheets cms ON cms.class_id = c.id
       LEFT JOIN cat_student_marks csm ON csm.sheet_id = cms.id
       WHERE u.school_id = $1
       GROUP BY c.id, u.name
       ORDER BY c.created_at DESC
       LIMIT 180`,
      [schoolId]
    );

    res.json({
      school: schoolRes.rows[0],
      summary: summaryRes.rows[0],
      teachers: teachersRes.rows,
      classes: classesRes.rows,
    });
  } catch (err) {
    console.error('[admin/my-school-board]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
