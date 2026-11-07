const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const staff = [authenticateToken, requireRole('teacher', 'head_teacher')];

// Strict level gate: Primary teachers see Primary material, Secondary teachers
// see Secondary material. Anything else is listed as locked (no file/questions).
function levelOf(grade, name) {
  const t = String(grade || name || '').trim().toUpperCase();
  if (/^(S\s?[0-9]|SENIOR|SECONDARY|FORM)/.test(t)) return 'secondary';
  if (/^(P\s?[0-9]|PRIMARY|PP|N[0-9]|NURSERY|BABY|MIDDLE|TOP)/.test(t)) return 'primary';
  const n = String(name || '').trim().toUpperCase();
  if (/^(S\s?[0-9]|SENIOR)/.test(n)) return 'secondary';
  if (/^(P\s?[0-9]|PRIMARY)/.test(n)) return 'primary';
  return 'other';
}

async function myLevels(userId) {
  const r = await pool.query('SELECT grade, name FROM classes WHERE teacher_id = $1', [userId]);
  return new Set(r.rows.map((c) => levelOf(c.grade, c.name)).filter((l) => l !== 'other'));
}

const GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

const TEACHER_FIELDS = `t.id AS teacher_id, t.name AS teacher_name, s.name AS school_name,
       c.id AS class_id, c.name AS class_name, c.grade AS class_grade`;
const TEACHER_JOINS = `JOIN classes c ON c.id = x.class_id
       JOIN users t ON t.id = c.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id`;

function shape(type, row, mine) {
  const level = levelOf(row.class_grade, row.class_name);
  const allowed = mine.has(level);
  return {
    type,
    id: row.id,
    title: row.title,
    subject: row.subject || null,
    description: type === 'homework' ? row.description || null : null,
    created_at: row.created_at,
    level,
    locked: !allowed,
    class_name: row.class_name,
    teacher: { id: row.teacher_id, name: row.teacher_name, school: row.school_name || null },
    file_path: allowed ? row.file_path || null : null,
    file_name: allowed ? row.file_name || null : null,
    question_count: type === 'quiz' ? Number(row.question_count || 0) : undefined,
  };
}

router.get('/', ...staff, async (req, res) => {
  try {
    const mine = await myLevels(req.user.id);
    const [hw, qz, nt] = await Promise.all([
      pool.query(
        `SELECT x.id, x.title, x.description, x.subject, x.file_path, x.file_name, x.created_at, ${TEACHER_FIELDS}
         FROM homework x ${TEACHER_JOINS} WHERE c.teacher_id <> $1 ORDER BY x.created_at DESC LIMIT 300`,
        [req.user.id]
      ),
      pool.query(
        `SELECT x.id, x.title, x.description, c.subject AS subject, x.created_at, ${TEACHER_FIELDS},
                (SELECT COUNT(*) FROM quiz_questions q WHERE q.quiz_id = x.id) AS question_count
         FROM quizzes x ${TEACHER_JOINS} WHERE c.teacher_id <> $1 ORDER BY x.created_at DESC LIMIT 300`,
        [req.user.id]
      ),
      pool.query(
        `SELECT x.id, x.title, c.subject AS subject, x.file_path, x.file_name, x.created_at, ${TEACHER_FIELDS}
         FROM notes x ${TEACHER_JOINS} WHERE c.teacher_id <> $1 ORDER BY x.created_at DESC LIMIT 300`,
        [req.user.id]
      ),
    ]);
    const items = [
      ...hw.rows.map((r) => shape('homework', r, mine)),
      ...qz.rows.map((r) => shape('quiz', r, mine)),
      ...nt.rows.map((r) => shape('note', r, mine)),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const own = await pool.query('SELECT id, name, grade FROM classes WHERE teacher_id = $1 ORDER BY id', [req.user.id]);
    const unleveled = own.rows.filter((c) => levelOf(c.grade, c.name) === 'other').map((c) => ({ id: c.id, name: c.name }));
    res.json({ my_levels: [...mine], unleveled_classes: unleveled, items });
  } catch (err) {
    console.error('[teacher-library]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// A teacher sets the grade (level) of one of their own classes.
router.put('/class-grade', ...staff, async (req, res) => {
  const grade = String(req.body.grade || '').trim().toUpperCase();
  if (!GRADES.includes(grade)) return res.status(400).json({ error: 'Choose a grade from P1 to S6.' });
  try {
    const r = await pool.query(
      'UPDATE classes SET grade = $1 WHERE id = $2 AND teacher_id = $3 RETURNING id, name, grade',
      [grade, Number(req.body.class_id), req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Class not found.' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[teacher-library class-grade]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Read-only quiz questions — same-level teachers only.
router.get('/quiz/:id', ...staff, async (req, res) => {
  try {
    const quiz = (await pool.query(
      `SELECT x.id, x.title, x.description, c.grade AS class_grade, c.name AS class_name, c.teacher_id, t.name AS teacher_name
       FROM quizzes x JOIN classes c ON c.id = x.class_id JOIN users t ON t.id = c.teacher_id WHERE x.id = $1`,
      [req.params.id]
    )).rows[0];
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    const mine = await myLevels(req.user.id);
    if (!mine.has(levelOf(quiz.class_grade, quiz.class_name))) {
      return res.status(403).json({ error: 'This quiz is from another level. Message or call the teacher to ask for access.', teacher_id: quiz.teacher_id });
    }
    const questions = (await pool.query(
      'SELECT question, option_a, option_b, option_c, option_d, correct_answer FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num, id',
      [quiz.id]
    )).rows;
    res.json({ quiz: { id: quiz.id, title: quiz.title, description: quiz.description, teacher_name: quiz.teacher_name, class_name: quiz.class_name }, questions });
  } catch (err) {
    console.error('[teacher-library quiz]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
