const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { ensureStudentSharesModerationColumns } = require('../lib/studentSharesSchema');

function schoolDomainFromName(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug ? `${slug}.edu` : null;
}

const router = express.Router();
const adminOnly = [authenticateToken, requireRole('admin')];
const teacherOrAbove = [authenticateToken, requireRole('admin', 'head_teacher', 'teacher')];

pool.query(`
  CREATE TABLE IF NOT EXISTS invite_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL,
    school_id INTEGER REFERENCES schools(id),
    creator_id INTEGER REFERENCES users(id),
    can_create_school BOOLEAN NOT NULL DEFAULT FALSE,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '14 days'
  );
`).catch(err => console.error('[admin] invite_tokens migration error:', err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS school_join_requests (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    school_id INTEGER NOT NULL REFERENCES schools(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    message TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP
  );
`).catch(err => console.error('[admin] school_join_requests migration error:', err.message));

pool.query(`
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS school VARCHAR(200);
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS class_name VARCHAR(100);
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(100);
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
  ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS review_note TEXT;
`).catch(err => console.error('[admin] student_shares moderation columns:', err.message));

pool.query(`
  ALTER TABLE student_shares DROP CONSTRAINT IF EXISTS student_shares_status_check;
  ALTER TABLE student_shares ADD CONSTRAINT student_shares_status_check
    CHECK (status IN ('pending','approved','declined'));
  UPDATE student_shares SET status = 'approved' WHERE status IS NULL OR status = '';
`).catch(err => console.error('[admin] student_shares status constraint:', err.message));

// ─── SCHOOL JOIN REQUESTS (teacher requests to join a school) ─────────────────

router.get('/my-school', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const row = await pool.query(
      'SELECT u.school_id, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE u.id = $1',
      [req.user.id]
    );
    res.json(row.rows[0] || { school_id: null, school_name: null });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/request-school', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { school_id, message } = req.body;
  if (!school_id) return res.status(400).json({ error: 'School is required.' });
  try {
    const existing = await pool.query(
      'SELECT id FROM school_join_requests WHERE teacher_id = $1 AND status = $2',
      [req.user.id, 'pending']
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You already have a pending school request. Please wait for approval.' });
    }
    const result = await pool.query(
      'INSERT INTO school_join_requests (teacher_id, school_id, message) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, school_id, message || null]
    );
    res.status(201).json({ request: result.rows[0], message: 'School request sent! Waiting for approval.' });
  } catch (err) {
    console.error('[request-school]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/my-school-request', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sjr.*, s.name AS school_name FROM school_join_requests sjr
       JOIN schools s ON s.id = sjr.school_id
       WHERE sjr.teacher_id = $1 ORDER BY sjr.created_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/school-requests', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    let query;
    if (req.user.role === 'admin') {
      query = await pool.query(
        `SELECT sjr.*, u.name AS teacher_name, u.email AS teacher_email, s.name AS school_name
         FROM school_join_requests sjr
         JOIN users u ON u.id = sjr.teacher_id
         JOIN schools s ON s.id = sjr.school_id
         ORDER BY sjr.created_at DESC`
      );
    } else {
      let userSchoolId = req.user.school_id;
      if (!userSchoolId) {
        const row = await pool.query('SELECT school_id FROM users WHERE id = $1', [req.user.id]);
        userSchoolId = row.rows[0]?.school_id;
      }
      if (!userSchoolId) return res.json([]);
      query = await pool.query(
        `SELECT sjr.*, u.name AS teacher_name, u.email AS teacher_email, s.name AS school_name
         FROM school_join_requests sjr
         JOIN users u ON u.id = sjr.teacher_id
         JOIN schools s ON s.id = sjr.school_id
         WHERE sjr.school_id = $1
         ORDER BY sjr.created_at DESC`,
        [userSchoolId]
      );
    }
    res.json(query.rows);
  } catch (err) {
    console.error('[school-requests GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/school-requests/:id/approve', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { id } = req.params;
  try {
    const reqRow = await pool.query('SELECT * FROM school_join_requests WHERE id = $1 AND status = $2', [id, 'pending']);
    if (reqRow.rows.length === 0) return res.status(404).json({ error: 'Request not found or already processed.' });
    const request = reqRow.rows[0];
    await pool.query('UPDATE users SET school_id = $1 WHERE id = $2', [request.school_id, request.teacher_id]);
    await pool.query(
      'UPDATE school_join_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3',
      ['approved', req.user.id, id]
    );
    res.json({ message: 'Teacher approved and assigned to school.' });
  } catch (err) {
    console.error('[school-requests approve]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/school-requests/:id/reject', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      'UPDATE school_join_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3',
      ['rejected', req.user.id, id]
    );
    res.json({ message: 'Request rejected.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── ADMIN VIEW-AS (impersonate teacher/student) ─────────────────────────────
router.post('/impersonate', ...adminOnly, async (req, res) => {
  const targetId = parseInt(req.body.user_id, 10);
  if (!targetId) return res.status(400).json({ error: 'Valid user_id is required.' });
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, school_id, is_suspended
       FROM users WHERE id = $1`,
      [targetId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const target = result.rows[0];
    if (!['teacher', 'student', 'head_teacher'].includes(target.role)) {
      return res.status(400).json({ error: 'You can only view teacher, head teacher, or student accounts.' });
    }
    if (target.is_suspended) return res.status(403).json({ error: 'This account is suspended.' });
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration: JWT secret missing.' });
    }
    const token = jwt.sign(
      { id: target.id, role: target.role, impersonated_by: req.user.id },
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
      },
    });
  } catch (err) {
    console.error('[admin impersonate]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
router.get('/stats', ...adminOnly, async (req, res) => {
  try {
    const [schools, teachers, students, classes, quizzes, homework, pending, installs, pendingArticles] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM schools'),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher' AND is_approved=TRUE"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='student'"),
      pool.query('SELECT COUNT(*) FROM classes'),
      pool.query('SELECT COUNT(*) FROM quizzes'),
      pool.query('SELECT COUNT(*) FROM homework'),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher' AND is_approved=FALSE"),
      pool.query('SELECT COUNT(*) FROM pwa_installs'),
      pool.query("SELECT COUNT(*) FROM student_shares WHERE status='pending'").catch(() => ({ rows: [{ count: 0 }] })),
    ]);
    res.json({
      schools: parseInt(schools.rows[0].count, 10),
      teachers: parseInt(teachers.rows[0].count, 10),
      students: parseInt(students.rows[0].count, 10),
      classes: parseInt(classes.rows[0].count, 10),
      quizzes: parseInt(quizzes.rows[0].count, 10),
      homework: parseInt(homework.rows[0].count, 10),
      pending_teachers: parseInt(pending.rows[0].count, 10),
      installations: parseInt(installs.rows[0].count, 10),
      pending_articles: parseInt(pendingArticles.rows[0].count, 10),
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
router.get('/schools/list', ...teacherOrAbove, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM schools ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

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
  const { name, location, code, email_domain } = req.body;
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  try {
    const result = await pool.query(
      'INSERT INTO schools (name, location, code, email_domain) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, location || null, code || null, email_domain || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/schools/:id', ...adminOnly, async (req, res) => {
  const { name, location, code, email_domain } = req.body;
  try {
    const result = await pool.query(
      'UPDATE schools SET name=$1, location=$2, code=$3, email_domain=$4 WHERE id=$5 RETURNING *',
      [name, location || null, code || null, email_domain || null, req.params.id]
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

async function createInviteLink(role, schoolId, creatorId, canCreateSchool) {
  const token = crypto.randomBytes(22).toString('hex');
  await pool.query(
    `INSERT INTO invite_tokens (token, role, school_id, creator_id, can_create_school, expires_at)
     VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '14 days')`,
    [token, role, schoolId, creatorId, canCreateSchool]
  );
  const frontendUrl = process.env.FRONTEND_URL || 'https://student.umunsi.com';
  return `${frontendUrl}/invite?token=${token}`;
}

router.post('/ht-link', ...adminOnly, async (req, res) => {
  const { school_id } = req.body;
  try {
    let school = null;
    if (school_id) {
      const schoolResult = await pool.query('SELECT id, name, email_domain, code FROM schools WHERE id=$1 LIMIT 1', [school_id]);
      if (schoolResult.rows.length === 0) return res.status(404).json({ error: 'School not found.' });
      school = schoolResult.rows[0];
    }
    const invite_link = await createInviteLink(
      'head_teacher',
      school ? school.id : null,
      req.user.id,
      !school
    );
    res.json({
      invite_link,
      school_name: school?.name || null,
      school_email_domain: school?.email_domain || null,
      school_code: school?.code || null,
    });
  } catch (err) {
    console.error('[admin invitations]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/teacher-link', ...adminOnly, async (req, res) => {
  const { school_id } = req.body;
  if (!school_id) return res.status(400).json({ error: 'School ID is required for teacher invitations.' });
  try {
    const schoolResult = await pool.query('SELECT id, name, email_domain, code FROM schools WHERE id=$1 LIMIT 1', [school_id]);
    if (schoolResult.rows.length === 0) return res.status(404).json({ error: 'School not found.' });
    const school = schoolResult.rows[0];
    const invite_link = await createInviteLink('teacher', school.id, req.user.id, false);
    res.json({
      invite_link,
      school_name: school.name,
      school_email_domain: school.email_domain,
      school_code: school.code,
    });
  } catch (err) {
    console.error('[admin invitations teacher]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── TEACHERS ─────────────────────────────────────────────────────────────────
router.get('/teachers', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.is_suspended, u.is_approved, u.created_at,
             s.name AS school_name,
             COUNT(DISTINCT c.id) AS class_count
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN classes c ON c.teacher_id = u.id
      WHERE u.role = 'teacher'
      GROUP BY u.id, s.name ORDER BY u.is_approved ASC, u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
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

// ─── STUDENT ARTICLE MODERATION ───────────────────────────────────────────────
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
  const shareId = parseInt(req.params.id, 10);
  if (!Number.isFinite(shareId)) {
    return res.status(400).json({ error: 'Invalid article id.' });
  }
  const decision = (req.body.decision || '').toString();
  const reviewNote = (req.body.review_note || '').toString().trim();
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved or declined.' });
  }
  if (decision === 'declined' && !reviewNote) {
    return res.status(400).json({ error: 'Decline reason is required.' });
  }
  const reviewerId = parseInt(req.user.id, 10);
  if (!Number.isFinite(reviewerId)) {
    return res.status(401).json({ error: 'Invalid session. Please log in again.' });
  }
  try {
    await ensureStudentSharesModerationColumns(pool);
    const noteToSave = decision === 'declined' ? reviewNote : null;
    const result = await pool.query(
      `UPDATE student_shares
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3
       WHERE id = $4
       RETURNING id, status, review_note, reviewed_at`,
      [decision, reviewerId, noteToSave, shareId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Article not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[admin student-shares moderate]', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Could not update article.' });
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

// ─── USER CREATION (Admin, Head Teacher, Teacher) ───────────────────────────
async function resolveSchoolForAccount(req, school_id) {
  if (req.user.role === 'teacher' || req.user.role === 'head_teacher') {
    let userSchoolId = req.user.school_id;
    if (!userSchoolId) {
      const row = await pool.query('SELECT school_id FROM users WHERE id = $1', [req.user.id]);
      userSchoolId = row.rows[0]?.school_id;
    }
    if (userSchoolId) return userSchoolId;
    if (school_id) return school_id;
    const err = new Error('Please select a school.');
    err.status = 400;
    throw err;
  } else if (req.user.role === 'admin' && !school_id) {
    const err = new Error('School ID is required for admin user creation.');
    err.status = 400;
    throw err;
  }
  return school_id;
}

async function createSchoolAccount(req, { name, email, role, school_id, password: customPassword, is_approved }) {
  if (!name || !role) {
    const err = new Error('Name and role are required.');
    err.status = 400;
    throw err;
  }
  if (!['student', 'teacher'].includes(role)) {
    const err = new Error('Role must be student or teacher.');
    err.status = 400;
    throw err;
  }

  const targetSchoolId = await resolveSchoolForAccount(req, school_id);
  const schoolResult = await pool.query('SELECT name, email_domain FROM schools WHERE id = $1', [targetSchoolId]);
  if (schoolResult.rows.length === 0) {
    const err = new Error('School not found.');
    err.status = 404;
    throw err;
  }

  let schoolDomain = schoolResult.rows[0].email_domain;
  if (!schoolDomain) {
    schoolDomain = schoolDomainFromName(schoolResult.rows[0].name);
    if (schoolDomain) {
      await pool.query(
        'UPDATE schools SET email_domain = $1 WHERE id = $2 AND (email_domain IS NULL OR email_domain = \'\')',
        [schoolDomain, targetSchoolId]
      );
    }
  }

  let userEmail = email;
  if (!userEmail) {
    if (!schoolDomain) {
      const err = new Error('School email domain is required for auto email generation.');
      err.status = 400;
      throw err;
    }
    const baseName = String(name).toLowerCase().replace(/[^a-z0-9]/g, '') || 'student';
    let candidateEmail = `${baseName}@${schoolDomain}`;
    let counter = 1;
    while (true) {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [candidateEmail]);
      if (existing.rows.length === 0) break;
      candidateEmail = `${baseName}${counter}@${schoolDomain}`;
      counter += 1;
    }
    userEmail = candidateEmail;
  } else if (!schoolDomain || !userEmail.endsWith(`@${schoolDomain}`)) {
    const err = new Error(`Email must end with @${schoolDomain}.`);
    err.status = 400;
    throw err;
  } else {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (existing.rows.length > 0) {
      const err = new Error('Email already exists.');
      err.status = 409;
      throw err;
    }
  }

  const finalPassword = customPassword && customPassword.trim().length >= 4
    ? customPassword.trim()
    : Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
  const hashed = await bcrypt.hash(finalPassword, 12);
  const approved = typeof is_approved === 'boolean'
    ? is_approved
    : role !== 'teacher';

  const result = await pool.query(
    `INSERT INTO users (name, email, password, role, school_id, is_approved)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, role, school_id`,
    [name, userEmail, hashed, role, targetSchoolId, approved]
  );

  return {
    user: result.rows[0],
    temp_password: finalPassword,
  };
}

router.post('/add-pupil', ...teacherOrAbove, async (req, res) => {
  try {
    const created = await createSchoolAccount(req, req.body);
    res.status(201).json({
      ...created,
      message: 'User created successfully. Share the temporary password with them.',
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[admin accounts POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/add-pupils', ...teacherOrAbove, async (req, res) => {
  const { names, role, school_id, password } = req.body;
  const nameList = Array.isArray(names)
    ? names.map((n) => String(n).trim()).filter(Boolean)
    : String(names || '').split(/\r?\n/).map((n) => n.trim()).filter(Boolean);

  if (nameList.length === 0) {
    return res.status(400).json({ error: 'Enter at least one student name (one per line).' });
  }
  if (nameList.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 accounts per batch.' });
  }

  const created = [];
  const failed = [];
  for (const name of nameList) {
    try {
      const row = await createSchoolAccount(req, { name, email: null, role: role || 'student', school_id, password });
      created.push(row);
    } catch (err) {
      failed.push({ name, error: err.message || 'Failed to create account.' });
    }
  }

  res.status(201).json({
    created,
    failed,
    message: `Created ${created.length} account(s).`,
  });
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
router.get('/settings', ...teacherOrAbove, async (req, res) => {
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

router.put('/settings', ...teacherOrAbove, async (req, res) => {
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

module.exports = router;
module.exports.createSchoolAccount = createSchoolAccount;
