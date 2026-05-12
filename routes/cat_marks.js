const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Auto-migrate table
pool.query(`
  CREATE TABLE IF NOT EXISTS cat_marks (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    marks_obtained INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    test_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, student_id, test_number)
  );
  CREATE INDEX IF NOT EXISTS idx_cat_marks_class ON cat_marks(class_id);
  CREATE INDEX IF NOT EXISTS idx_cat_marks_student ON cat_marks(student_id);
`).catch(e => console.error('[cat_marks] migration error:', e.message));

// GET class CAT stats (test count, total, percentage, class avg)
router.get('/:classId/stats', authenticateToken, requireRole('teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    const classMembers = await pool.query(
      `SELECT DISTINCT student_id FROM class_members WHERE class_id = $1`,
      [classId]
    );
    const studentIds = classMembers.rows.map(r => r.student_id);
    
    const stats = await pool.query(
      `SELECT 
        c.id, c.student_id, u.name,
        COUNT(DISTINCT c.test_number) as test_count,
        SUM(c.marks_obtained) as total_marks,
        COALESCE(ROUND(100.0 * SUM(c.marks_obtained) / NULLIF(SUM(c.total_marks), 0), 1), 0) as percentage,
        COALESCE(ROUND(AVG(100.0 * c.marks_obtained / NULLIF(c.total_marks, 1)), 1), 0) as avg_percentage
       FROM cat_marks c
       JOIN users u ON c.student_id = u.id
       WHERE c.class_id = $1 AND c.student_id = ANY($2::int[])
       GROUP BY c.student_id, u.name, c.id
       ORDER BY u.name`,
      [classId, studentIds.length > 0 ? studentIds : [0]]
    );

    const classAvg = await pool.query(
      `SELECT COALESCE(ROUND(AVG(100.0 * marks_obtained / NULLIF(total_marks, 1)), 1), 0) as avg
       FROM cat_marks WHERE class_id = $1`,
      [classId]
    );

    res.json({
      students: stats.rows,
      class_average: classAvg.rows[0]?.avg || 0
    });
  } catch (err) {
    console.error('[cat_marks] stats error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET student's CAT marks for a class
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

// POST/PUT record CAT mark (teacher)
router.post('/:classId/mark', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { student_id, test_number, marks_obtained, total_marks } = req.body;
  const classId = req.params.classId;
  if (!student_id || !test_number || marks_obtained === undefined) {
    return res.status(400).json({ error: 'student_id, test_number, marks_obtained required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (class_id, student_id, test_number)
       DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()
       RETURNING *`,
      [classId, student_id, test_number, marks_obtained, total_marks || 100]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[cat_marks] record error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST migrate quiz marks to CAT (teacher)
router.post('/:classId/migrate-quiz', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { quiz_id, test_number } = req.body;
  const classId = req.params.classId;
  if (!quiz_id || !test_number) {
    return res.status(400).json({ error: 'quiz_id and test_number required.' });
  }
  try {
    // Get the best quiz attempt score for each student in this class
    const attempts = await pool.query(
      `SELECT DISTINCT ON (qa.student_id) qa.student_id, qa.score, qa.total
       FROM quiz_attempts qa
       JOIN class_members cm ON qa.student_id = cm.student_id
       WHERE qa.quiz_id = $1 AND cm.class_id = $2
       ORDER BY qa.student_id, qa.score DESC, qa.attempted_at ASC`,
      [quiz_id, classId]
    );

    // Insert into cat_marks
    for (const att of attempts.rows) {
      await pool.query(
        `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_id, student_id, test_number)
         DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()`,
        [classId, att.student_id, test_number, att.score, att.total]
      );
    }

    res.json({ migrated: attempts.rows.length });
  } catch (err) {
    console.error('[cat_marks] migrate error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE CAT mark (teacher)
router.delete('/:classId/mark/:markId', authenticateToken, requireRole('teacher'), async (req, res) => {
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

module.exports = router;
