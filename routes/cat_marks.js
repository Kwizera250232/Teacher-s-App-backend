const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const SUBJECTS = [
  'English',
  'Kinyarwanda',
  'Mathematics',
  'Social and Religious Studies',
  'SET',
];

async function ensureCatTables() {
  try {
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
        marks JSONB,
        total NUMERIC(6,2) NOT NULL DEFAULT 0,
        percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (sheet_id, student_id)
      )
    `);
    
    await pool.query(`
      ALTER TABLE cat_student_marks ADD COLUMN IF NOT EXISTS marks JSONB
    `).catch(() => {});
  } catch (e) {
    console.error('[cat] table migration error:', e.message);
  }
}

ensureCatTables();

function parseSubject(subject) {
  const clean = String(subject || '').trim();
  if (!SUBJECTS.includes(clean)) return null;
  return clean;
}

function sanitizeCat(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function calcTotalAndPercentage(cats) {
  const total = cats.reduce((sum, v) => sum + (v == null ? 0 : Number(v)), 0);
  return {
    total: Math.round(total * 100) / 100,
    percentage: 0,
  };
}

async function assertTeacherOwnsClass(classId, teacherId) {
  const classCheck = await pool.query('SELECT id FROM classes WHERE id=$1 AND teacher_id=$2', [classId, teacherId]);
  return classCheck.rows.length > 0;
}

async function getStudents(classId) {
  const result = await pool.query(
    `SELECT u.id,
            COALESCE(NULLIF(TRIM(u.name), ''), split_part(u.email, '@', 1)) AS name,
            cm.joined_at
     FROM class_members cm
     JOIN users u ON cm.student_id = u.id
     WHERE cm.class_id = $1
     ORDER BY cm.joined_at ASC`,
    [classId]
  );
  return result.rows;
}

async function getClassMeta(classId) {
  const result = await pool.query(
    `SELECT c.id,
            c.name AS class_name,
            c.subject AS class_subject,
            c.class_code,
            u.name AS teacher_name,
            s.name AS school_name
     FROM classes c
     JOIN users u ON u.id = c.teacher_id
     LEFT JOIN schools s ON s.id = u.school_id
     WHERE c.id = $1`,
    [classId]
  );
  return result.rows[0] || null;
}

router.get('/cat/subjects', authenticateToken, requireRole('teacher'), (req, res) => {
  res.json(SUBJECTS);
});

router.get('/cat/classes', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.subject, c.class_code
       FROM classes c
       WHERE c.teacher_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/cat/:classId/students', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class id.' });

  try {
    const ok = await assertTeacherOwnsClass(classId, req.user.id);
    if (!ok) return res.status(403).json({ error: 'Forbidden.' });

    const students = await getStudents(classId);
    res.json(students.map((s, i) => ({ ...s, number: i + 1 })));
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/cat/:classId/sheet', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const subject = parseSubject(req.query.subject);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class id.' });
  if (!subject) return res.status(400).json({ error: 'Invalid subject.' });

  try {
    const ok = await assertTeacherOwnsClass(classId, req.user.id);
    if (!ok) return res.status(403).json({ error: 'Forbidden.' });

    const meta = await getClassMeta(classId);
    const students = await getStudents(classId);

    const sheetResult = await pool.query(
      `SELECT * FROM cat_mark_sheets WHERE class_id=$1 AND teacher_id=$2 AND subject=$3`,
      [classId, req.user.id, subject]
    );

    if (sheetResult.rows.length === 0) {
      return res.json({
        sheet: {
          class_id: classId,
          subject,
          lesson_title: '',
          lesson_topic: '',
          cat_count: 10,
        },
        meta,
        rows: students.map((s, i) => ({
          number: i + 1,
          student_id: s.id,
          student_name: s.name,
          cats: Array(10).fill(null),
          total: 0,
          percentage: 0,
        })),
      });
    }

    const sheet = sheetResult.rows[0];
    const marksResult = await pool.query(
      `SELECT student_id, marks, total, percentage
       FROM cat_student_marks
       WHERE sheet_id = $1`,
      [sheet.id]
    );

    const byStudent = new Map(marksResult.rows.map((r) => [r.student_id, r]));

    const rows = students.map((s, i) => {
      const m = byStudent.get(s.id);
      if (!m) {
        return {
          number: i + 1,
          student_id: s.id,
          student_name: s.name,
          cats: [],
          total: 0,
          percentage: 0,
        };
      }
      const cats = Array.isArray(m.marks) ? m.marks.map((v) => v == null ? null : Number(v)) : [];
      return {
        number: i + 1,
        student_id: s.id,
        student_name: s.name,
        cats,
        total: Number(m.total),
        percentage: Number(m.percentage),
      };
    });

    res.json({ sheet, meta, rows });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/cat/:classId/sheet', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const subject = parseSubject(req.body.subject);
  const lessonTitle = String(req.body.lesson_title || '').trim().slice(0, 255);
  const lessonTopic = String(req.body.lesson_topic || '').trim().slice(0, 255);
  const marks = Array.isArray(req.body.marks) ? req.body.marks : [];

  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class id.' });
  if (!subject) return res.status(400).json({ error: 'Invalid subject.' });

  const client = await pool.connect();
  try {
    const ok = await assertTeacherOwnsClass(classId, req.user.id);
    if (!ok) return res.status(403).json({ error: 'Forbidden.' });

    await client.query('BEGIN');

    const sheetResult = await client.query(
      `INSERT INTO cat_mark_sheets (class_id, teacher_id, subject, lesson_title, lesson_topic, cat_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, 10, NOW())
       ON CONFLICT (class_id, teacher_id, subject)
       DO UPDATE SET lesson_title = EXCLUDED.lesson_title,
                     lesson_topic = EXCLUDED.lesson_topic,
                     updated_at = NOW()
       RETURNING *`,
      [classId, req.user.id, subject, lessonTitle || null, lessonTopic || null]
    );

    const sheet = sheetResult.rows[0];

    for (const row of marks) {
      const studentId = Number(row.student_id);
      if (!Number.isInteger(studentId)) continue;

      const rawCats = Array.isArray(row.cats) ? row.cats : [];
      const cats = rawCats.map((v) => sanitizeCat(v));
      const { total, percentage } = calcTotalAndPercentage(cats);

      await client.query(
        `INSERT INTO cat_student_marks
          (sheet_id, student_id, marks, total, percentage, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (sheet_id, student_id)
         DO UPDATE SET
            marks = EXCLUDED.marks,
            total = EXCLUDED.total,
            percentage = EXCLUDED.percentage,
            updated_at = NOW()`,
        [sheet.id, studentId, JSON.stringify(cats), total, percentage]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'CAT marks saved successfully.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[cat] save error:', e.message);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
