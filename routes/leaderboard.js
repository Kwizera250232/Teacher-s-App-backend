const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ensure badges table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS student_badges (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge VARCHAR(50) NOT NULL,
    quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    awarded_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, badge, quiz_id)
  )
`).catch(console.error);

// GET leaderboard for a class (best score per student across all quizzes)
router.get('/:classId/leaderboard', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id AS student_id,
         u.name AS student_name,
         COUNT(DISTINCT qa.quiz_id)::int AS quizzes_taken,
         SUM(qa.score)::int AS total_score,
         SUM(qa.total)::int AS total_possible,
         ROUND(SUM(qa.score)::numeric / NULLIF(SUM(qa.total),0) * 100) AS avg_percentage,
         MAX(qa.score::numeric / NULLIF(qa.total,0) * 100) AS best_percentage
       FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       LEFT JOIN quiz_attempts qa ON qa.student_id = u.id
         AND qa.quiz_id IN (SELECT id FROM quizzes WHERE class_id = $1)
       WHERE cm.class_id = $1
       GROUP BY u.id, u.name
       ORDER BY total_score DESC NULLS LAST, avg_percentage DESC NULLS LAST`,
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET leaderboard for a specific quiz
router.get('/:classId/quizzes/:quizId/leaderboard', authenticateToken, async (req, res) => {
  try {
    const quizInfo = await pool.query('SELECT title FROM quizzes WHERE id=$1', [req.params.quizId]);
    const result = await pool.query(
      `SELECT qa.id AS attempt_id, u.id AS student_id, u.name AS student_name,
              qa.score, qa.total,
              ROUND(qa.score::numeric / NULLIF(qa.total,0) * 100) AS percentage,
              qa.attempted_at
       FROM quiz_attempts qa
       JOIN users u ON u.id = qa.student_id
       WHERE qa.quiz_id = $1
       ORDER BY qa.score DESC, qa.attempted_at ASC`,
      [req.params.quizId]
    );
    res.json({
      quiz_title: quizInfo.rows[0]?.title || '',
      entries: result.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET my badges
router.get('/my-badges', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sb.*, q.title AS quiz_title, c.name AS class_name
       FROM student_badges sb
       LEFT JOIN quizzes q ON q.id = sb.quiz_id
       LEFT JOIN classes c ON c.id = sb.class_id
       WHERE sb.student_id = $1 ORDER BY sb.awarded_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET top scorer per quiz for a class (used on dashboard cards)
router.get('/:classId/top-scorers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (q.id)
         q.id AS quiz_id,
         q.title AS quiz_title,
         u.name AS top_student,
         qa.score,
         qa.total,
         ROUND(qa.score::numeric / NULLIF(qa.total,0) * 100) AS percentage
       FROM quizzes q
       JOIN quiz_attempts qa ON qa.quiz_id = q.id
       JOIN users u ON u.id = qa.student_id
       WHERE q.class_id = $1
       ORDER BY q.id, qa.score DESC, qa.attempted_at ASC`,
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
