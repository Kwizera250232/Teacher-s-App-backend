const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Generate a random 6-char alphanumeric class code
function generateClassCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// POST create class (teacher)
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { name, subject } = req.body;
  if (!name) return res.status(400).json({ error: 'Class name is required.' });
  try {
    let code;
    let unique = false;
    while (!unique) {
      code = generateClassCode();
      const exists = await pool.query('SELECT id FROM classes WHERE class_code = $1', [code]);
      if (exists.rows.length === 0) unique = true;
    }
    const result = await pool.query(
      'INSERT INTO classes (name, subject, teacher_id, class_code) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, subject || null, req.user.id, code]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// GET single class details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS teacher_name FROM classes c JOIN users u ON c.teacher_id = u.id WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Class not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET students in a class (teacher)
router.get('/:id/students', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, cm.joined_at
       FROM class_members cm JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1 ORDER BY cm.joined_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
