const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = [authenticateToken, requireRole('admin')];

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
router.get('/stats', ...adminOnly, async (req, res) => {
  try {
    const [schools, teachers, students, classes, quizzes, homework] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM schools"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher'"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='student'"),
      pool.query("SELECT COUNT(*) FROM classes"),
      pool.query("SELECT COUNT(*) FROM quizzes"),
      pool.query("SELECT COUNT(*) FROM homework"),
    ]);
    res.json({
      schools: parseInt(schools.rows[0].count),
      teachers: parseInt(teachers.rows[0].count),
      students: parseInt(students.rows[0].count),
      classes: parseInt(classes.rows[0].count),
      quizzes: parseInt(quizzes.rows[0].count),
      homework: parseInt(homework.rows[0].count),
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
  const { name, location, code } = req.body;
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  try {
    const result = await pool.query(
      'INSERT INTO schools (name, location, code) VALUES ($1,$2,$3) RETURNING *',
      [name, location || null, code || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/schools/:id', ...adminOnly, async (req, res) => {
  const { name, location, code } = req.body;
  try {
    const result = await pool.query(
      'UPDATE schools SET name=$1, location=$2, code=$3 WHERE id=$4 RETURNING *',
      [name, location || null, code || null, req.params.id]
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
      SELECT u.id, u.name, u.email, u.is_suspended, u.created_at,
             s.name AS school_name,
             COUNT(DISTINCT c.id) AS class_count
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN classes c ON c.teacher_id = u.id
      WHERE u.role = 'teacher'
      GROUP BY u.id, s.name ORDER BY u.created_at DESC
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
      SELECT u.id, u.name, u.email, u.is_suspended, u.created_at,
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

module.exports = router;
