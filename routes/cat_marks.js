const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

pool.query(`
  CREATE TABLE IF NOT EXISTS cat_marks (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    marks_obtained INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    test_date DATE DEFAULT CURRENT_DATE,
    subject TEXT DEFAULT 'General',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, student_id, test_number, subject)
  );
  CREATE INDEX IF NOT EXISTS idx_cat_marks_class ON cat_marks(class_id);
  CREATE INDEX IF NOT EXISTS idx_cat_marks_student ON cat_marks(student_id);
  ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS test_date DATE DEFAULT CURRENT_DATE;
  ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT 'General';
  DROP CONSTRAINT IF EXISTS cat_marks_class_id_student_id_test_number_key;

  CREATE TABLE IF NOT EXISTS cat_totals_config (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    subject TEXT DEFAULT 'General',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, test_number, subject)
  );
`).catch(e => console.error('[cat_marks] migration error:', e.message));

router.get('/:classId/overview', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  const subject = req.query.subject || '';
  try {
    const roster = await pool.query(
      `SELECT u.id AS student_id, u.name
       FROM class_members cm
       JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1
       ORDER BY u.name`,
      [classId]
    );

    // Get marks — optionally filtered by subject
    let marksRows;
    if (subject) {
      marksRows = await pool.query(
        `SELECT student_id, test_number, marks_obtained, total_marks, subject
         FROM cat_marks WHERE class_id = $1 AND subject = $2`,
        [classId, subject]
      );
    } else {
      marksRows = await pool.query(
        `SELECT student_id, test_number, marks_obtained, total_marks, subject
         FROM cat_marks WHERE class_id = $1`,
        [classId]
      );
    }

    // Get list of subjects that have marks
    const subjectsResult = await pool.query(
      `SELECT DISTINCT subject FROM cat_marks WHERE class_id = $1 ORDER BY subject`,
      [classId]
    );

    const marksByStudent = new Map();
    const catTotals = {}; // { test_number: total_marks } — the "out of" for each CAT

    // First, load configured totals from cat_totals_config (teacher-set totals)
    const configRows = await pool.query(
      `SELECT test_number, total_marks FROM cat_totals_config WHERE class_id = $1 AND subject = $2`,
      [classId, subject || 'General']
    );
    for (const row of configRows.rows) {
      catTotals[row.test_number] = Number(row.total_marks) || 100;
    }

    for (const row of marksRows.rows) {
      if (!marksByStudent.has(row.student_id)) marksByStudent.set(row.student_id, {});
      marksByStudent.get(row.student_id)[row.test_number] = {
        marks: Number(row.marks_obtained),
        total: Number(row.total_marks) || catTotals[row.test_number] || 100,
      };
      // Fall back to marks if no config entry
      if (!catTotals[row.test_number]) catTotals[row.test_number] = Number(row.total_marks) || 100;
    }

    const students = roster.rows.map((s) => {
      const tests = marksByStudent.get(s.student_id) || {};
      const cat = {};
      let sumMarks = 0;
      let sumTotal = 0;
      let testCount = 0;
      for (let n = 1; n <= 10; n += 1) {
        if (tests[n]) {
          cat[n] = tests[n].marks;
          sumMarks += tests[n].marks;
          sumTotal += tests[n].total;
          testCount += 1;
        } else {
          cat[n] = null;
        }
      }
      const percentage = sumTotal > 0 ? Math.round((1000 * sumMarks) / sumTotal) / 10 : 0;
      const avg_percentage = testCount > 0
        ? Math.round(
          (Object.values(tests).reduce((acc, t) => acc + (100 * t.marks) / (t.total || 100), 0) / testCount) * 10
        ) / 10
        : 0;
      return {
        student_id: s.student_id,
        name: s.name,
        cat,
        test_count: testCount,
        total_marks: sumMarks,
        percentage,
        avg_percentage,
      };
    });

    const classAvg = await pool.query(
      `SELECT COALESCE(ROUND(AVG(100.0 * marks_obtained / NULLIF(total_marks, 1)), 1), 0) AS avg
       FROM cat_marks WHERE class_id = $1`,
      [classId]
    );

    res.json({
      students,
      class_average: classAvg.rows[0]?.avg || 0,
      subjects: subjectsResult.rows.map(r => r.subject),
      cat_totals: catTotals,
    });
  } catch (err) {
    console.error('[cat_marks] summary error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:classId/student/:studentId', authenticateToken, async (req, res) => {
  const { classId, studentId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM cat_marks WHERE class_id = $1 AND student_id = $2 ORDER BY test_number`,
      [classId, studentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/:classId/entry', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { student_id, test_number, marks_obtained, total_marks, subject } = req.body;
  const classId = req.params.classId;
  if (!student_id || !test_number || marks_obtained === undefined) {
    return res.status(400).json({ error: 'student_id, test_number, marks_obtained required.' });
  }
  const subj = subject || 'General';
  try {
    // If no total_marks provided, look up from config or default to 100
    let finalTotal = total_marks;
    if (!finalTotal) {
      const configRes = await pool.query(
        `SELECT total_marks FROM cat_totals_config WHERE class_id = $1 AND test_number = $2 AND subject = $3`,
        [classId, test_number, subj]
      );
      finalTotal = configRes.rows[0]?.total_marks || 100;
    }
    const result = await pool.query(
      `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks, subject)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (class_id, student_id, test_number, subject)
       DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()
       RETURNING *`,
      [classId, student_id, test_number, marks_obtained, finalTotal, subj]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[cat_marks] save error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Set/change the "out of" (total_marks) for a specific CAT number across all students in a class+subject
router.put('/:classId/cat-total', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { test_number, total_marks, subject } = req.body;
  const classId = req.params.classId;
  if (!test_number || !total_marks || total_marks < 1) {
    return res.status(400).json({ error: 'test_number and total_marks (>=1) required.' });
  }
  const subj = subject || 'General';
  try {
    // Save to config table (persists even if no marks exist yet)
    await pool.query(
      `INSERT INTO cat_totals_config (class_id, test_number, total_marks, subject)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_id, test_number, subject)
       DO UPDATE SET total_marks = $3, updated_at = NOW()`,
      [classId, test_number, total_marks, subj]
    );
    // Also update all existing marks for this CAT
    const result = await pool.query(
      `UPDATE cat_marks SET total_marks = $4, updated_at = NOW()
       WHERE class_id = $1 AND test_number = $2 AND subject = $3`,
      [classId, test_number, subj, total_marks]
    );
    res.json({ updated: result.rowCount, test_number, total_marks, subject: subj });
  } catch (err) {
    console.error('[cat_marks] set-cat-total error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/:classId/fromquiz', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { quiz_id, test_number, subject } = req.body;
  const classId = req.params.classId;
  if (!quiz_id || !test_number) {
    return res.status(400).json({ error: 'quiz_id and test_number required.' });
  }
  const subj = subject || 'General';
  try {
    const attempts = await pool.query(
      `SELECT DISTINCT ON (qa.student_id) qa.student_id, qa.score, qa.total
       FROM quiz_attempts qa
       JOIN class_members cm ON qa.student_id = cm.student_id
       WHERE qa.quiz_id = $1 AND cm.class_id = $2
       ORDER BY qa.student_id, qa.score DESC, qa.attempted_at ASC`,
      [quiz_id, classId]
    );

    for (const att of attempts.rows) {
      await pool.query(
        `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks, subject)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (class_id, student_id, test_number, subject)
         DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()`,
        [classId, att.student_id, test_number, att.score, att.total, subj]
      );
    }

    res.json({ migrated: attempts.rows.length });
  } catch (err) {
    console.error('[cat_marks] from-quiz error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:classId/entry/:markId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM cat_marks WHERE id = $1 AND class_id = $2`,
      [req.params.markId, req.params.classId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:classId/entry/:studentId/:testNumber', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const subject = req.query.subject || 'General';
    await pool.query(
      `DELETE FROM cat_marks WHERE class_id = $1 AND student_id = $2 AND test_number = $3 AND subject = $4`,
      [req.params.classId, req.params.studentId, req.params.testNumber, subject]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
