const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET quizzes for a class
router.get('/:classId/quizzes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM quizzes WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create quiz with questions (teacher)
router.post('/:classId/quizzes', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { title, description, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Title and at least one question are required.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quizResult = await client.query(
      'INSERT INTO quizzes (class_id, title, description) VALUES ($1,$2,$3) RETURNING *',
      [req.params.classId, title, description || null]
    );
    const quiz = quizResult.rows[0];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, order_num)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [quiz.id, q.question, q.option_a, q.option_b, q.option_c || null, q.option_d || null, q.correct_answer.toLowerCase(), i]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...quiz, question_count: questions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET quiz questions (for taking quiz)
router.get('/:classId/quizzes/:quizId/questions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST submit quiz answers (student) - auto marks
router.post('/:classId/quizzes/:quizId/submit', authenticateToken, requireRole('student'), async (req, res) => {
  const { answers } = req.body; // { questionId: 'a', ... }
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Answers are required.' });
  }
  try {
    const questions = await pool.query(
      'SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = $1',
      [req.params.quizId]
    );
    let score = 0;
    const results = {};
    for (const q of questions.rows) {
      const given = (answers[q.id] || '').toLowerCase();
      const correct = q.correct_answer;
      const isCorrect = given === correct;
      if (isCorrect) score++;
      results[q.id] = { given, correct, isCorrect };
    }
    const total = questions.rows.length;
    await pool.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, score, total, answers)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.quizId, req.user.id, score, total, JSON.stringify(answers)]
    );
    res.json({ score, total, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET quiz results for teacher
router.get('/:classId/quizzes/:quizId/results', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qa.*, u.name AS student_name FROM quiz_attempts qa
       JOIN users u ON qa.student_id = u.id
       WHERE qa.quiz_id = $1 ORDER BY qa.score DESC`,
      [req.params.quizId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE quiz (teacher)
router.delete('/:classId/quizzes/:quizId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM quizzes WHERE id = $1 AND class_id = $2', [req.params.quizId, req.params.classId]);
    res.json({ message: 'Quiz deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
