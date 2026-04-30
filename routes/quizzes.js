const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Auto-migrate new columns
pool.query(`
  ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'multiple_choice';
  ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS passage TEXT;
  ALTER TABLE quiz_questions ALTER COLUMN correct_answer TYPE VARCHAR(500);
  ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_correct_answer_check;
  ALTER TABLE quiz_questions ALTER COLUMN option_a DROP NOT NULL;
  ALTER TABLE quiz_questions ALTER COLUMN option_b DROP NOT NULL;
`).catch(e => console.error('[quizzes] migration error:', e.message));

// GET quizzes for a class (includes attempt_count so teacher knows if editable)
router.get('/:classId/quizzes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.*, COUNT(qa.id)::int AS attempt_count
       FROM quizzes q
       LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
       WHERE q.class_id = $1
       GROUP BY q.id
       ORDER BY q.created_at DESC`,
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
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
      const qtype = q.question_type || 'multiple_choice';
      // For fill_blank: store actual answer in passage, use 'a' as correct_answer placeholder
      // For matching: correct_answer 'a' (grading uses passage JSON)
      // This ensures compatibility with CHAR(1) schema before migration runs
      let dbCorrectAnswer, dbPassage;
      if (qtype === 'fill_blank') {
        dbCorrectAnswer = 'a';
        dbPassage = q.correct_answer || '';
      } else if (qtype === 'matching') {
        dbCorrectAnswer = 'a';
        dbPassage = q.passage || null;
      } else {
        dbCorrectAnswer = (q.correct_answer || 'a').toLowerCase().charAt(0);
        dbPassage = q.passage || null;
      }
      // option_a/option_b are NOT NULL in old schema — use placeholder for non-MC types
      const dbOptionA = q.option_a || (qtype === 'multiple_choice' || qtype === 'true_false' ? '' : '-');
      const dbOptionB = q.option_b || (qtype === 'multiple_choice' || qtype === 'true_false' ? '' : '-');
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [quiz.id, q.question, dbOptionA, dbOptionB, q.option_c||null, q.option_d||null,
         dbCorrectAnswer, qtype, dbPassage, i]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...quiz, question_count: questions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[quizzes] create quiz error:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Internal server error.' });
  } finally {
    client.release();
  }
});

// GET quiz questions for teacher (includes correct_answer for editing)
router.get('/:classId/quizzes/:quizId/questions-edit', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );
    // For fill_blank: restore actual answer from passage back to correct_answer for the edit UI
    const rows = result.rows.map(r =>
      r.question_type === 'fill_blank'
        ? { ...r, correct_answer: r.passage || r.correct_answer }
        : r
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT update quiz (teacher) — only allowed if no attempts exist
router.put('/:classId/quizzes/:quizId', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { title, description, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Title and at least one question are required.' });
  }
  const client = await pool.connect();
  try {
    // Block edit if any student has already attempted this quiz
    const attemptCheck = await client.query(
      'SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = $1',
      [req.params.quizId]
    );
    if (parseInt(attemptCheck.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Cannot edit a quiz that students have already attempted.' });
    }
    await client.query('BEGIN');
    await client.query(
      'UPDATE quizzes SET title=$1, description=$2 WHERE id=$3 AND class_id=$4',
      [title, description || null, req.params.quizId, req.params.classId]
    );
    await client.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [req.params.quizId]);
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qtype = q.question_type || 'multiple_choice';
      let dbCorrectAnswer, dbPassage;
      if (qtype === 'fill_blank') {
        dbCorrectAnswer = 'a';
        dbPassage = q.correct_answer || '';
      } else if (qtype === 'matching') {
        dbCorrectAnswer = 'a';
        dbPassage = q.passage || null;
      } else {
        dbCorrectAnswer = (q.correct_answer || 'a').toLowerCase().charAt(0);
        dbPassage = q.passage || null;
      }
      const dbOptionA = q.option_a || (qtype === 'multiple_choice' || qtype === 'true_false' ? '' : '-');
      const dbOptionB = q.option_b || (qtype === 'multiple_choice' || qtype === 'true_false' ? '' : '-');
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.params.quizId, q.question, dbOptionA, dbOptionB, q.option_c||null, q.option_d||null,
         dbCorrectAnswer, qtype, dbPassage, i]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Quiz updated.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// GET quiz questions (for taking quiz)
router.get('/:classId/quizzes/:quizId/questions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST submit quiz answers (student) - auto marks
router.post('/:classId/quizzes/:quizId/submit', authenticateToken, requireRole('student'), async (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Answers are required.' });
  }
  try {
    // Block retake — one attempt per student per quiz
    const existing = await pool.query(
      'SELECT id FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2',
      [req.params.quizId, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'already_submitted' });
    }

    const questions = await pool.query(
      'SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = $1',
      [req.params.quizId]
    );
    let score = 0;
    const results = {};
    for (const q of questions.rows) {
      const given = String(answers[q.id] ?? '');
      const correct = q.correct_answer;
      let isCorrect = false;
      if (q.question_type === 'fill_blank') {
        // Answer is stored in passage (correct_answer is placeholder 'a')
        const fillAnswer = (q.passage || correct || '').trim().toLowerCase();
        isCorrect = given.trim().toLowerCase() === fillAnswer;
      } else if (q.question_type === 'matching') {
        try {
          const pairs = JSON.parse(q.passage || '[]');
          const givenParts = given.split('|');
          isCorrect = pairs.length > 0 && pairs.every((pair, idx) =>
            (givenParts[idx] || '').trim().toLowerCase() === pair.right.trim().toLowerCase()
          );
        } catch { isCorrect = false; }
      } else {
        isCorrect = given.toLowerCase() === (correct || '').toLowerCase();
      }
      if (isCorrect) score++;
      results[q.id] = { given, correct, isCorrect };
    }
    const total = questions.rows.length;
    await pool.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, score, total, answers)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.quizId, req.user.id, score, total, JSON.stringify(answers)]
    );

    // Auto-award badges
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const badgesToAward = [];
    if (percentage === 100) badgesToAward.push('perfect_score');
    if (percentage >= 90)  badgesToAward.push('excellence');
    if (percentage >= 75)  badgesToAward.push('great_job');
    if (score === 0)       badgesToAward.push('keep_going');

    // Check if #1 on this quiz
    const topCheck = await pool.query(
      `SELECT student_id FROM quiz_attempts WHERE quiz_id=$1 ORDER BY score DESC, attempted_at ASC LIMIT 1`,
      [req.params.quizId]
    );
    if (topCheck.rows[0]?.student_id === req.user.id || topCheck.rows.length === 0) {
      badgesToAward.push('top_student');
    }

    const earnedBadges = [];
    for (const badge of badgesToAward) {
      try {
        await pool.query(
          `INSERT INTO student_badges (student_id, badge, quiz_id, class_id)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [req.user.id, badge, req.params.quizId, req.params.classId]
        );
        earnedBadges.push(badge);
      } catch (_) {}
    }

    res.json({ score, total, results, earnedBadges });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET student's own quiz result detail (for self-download)
router.get('/:classId/quizzes/:quizId/my-result', authenticateToken, async (req, res) => {
  try {
    const attemptResult = await pool.query(
      `SELECT
         qa.*,
         u.name   AS student_name,
         qz.title AS quiz_title,
         c.name   AS class_name,
         c.subject AS class_subject,
         t.name   AS teacher_name,
         s.name   AS school_name,
         (SELECT COUNT(*)::int FROM quizzes q2
          WHERE q2.class_id = qz.class_id AND q2.created_at <= qz.created_at) AS quiz_number
       FROM quiz_attempts qa
       JOIN users u   ON u.id  = qa.student_id
       JOIN quizzes qz ON qz.id = qa.quiz_id
       JOIN classes c  ON c.id  = qz.class_id
       JOIN users t   ON t.id  = c.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id
       WHERE qa.quiz_id = $1 AND qa.student_id = $2
       ORDER BY qa.attempted_at DESC LIMIT 1`,
      [req.params.quizId, req.user.id]
    );
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: 'No attempt found.' });
    }
    const attempt = attemptResult.rows[0];
    const answers = attempt.answers || {};

    const questionsResult = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );

    const optionMap = { a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d' };
    const detailed = questionsResult.rows.map((q, idx) => {
      const studentAnswer = String(answers[String(q.id)] ?? '');
      const correctAnswer = q.correct_answer;
      const qtype = q.question_type || 'multiple_choice';
      let isCorrect = false;
      if (qtype === 'fill_blank') {
        isCorrect = studentAnswer.trim().toLowerCase() === (correctAnswer||'').trim().toLowerCase();
      } else if (qtype === 'matching') {
        try {
          const pairs = JSON.parse(q.passage || '[]');
          const parts = studentAnswer.split('|');
          isCorrect = pairs.length > 0 && pairs.every((p, i) =>
            (parts[i]||'').trim().toLowerCase() === p.right.trim().toLowerCase());
        } catch { isCorrect = false; }
      } else {
        isCorrect = studentAnswer.toLowerCase() === (correctAnswer||'').toLowerCase();
      }
      return {
        number: idx + 1,
        question: q.question,
        question_type: qtype,
        passage: q.passage,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        student_answer: studentAnswer || 'No answer',
        student_answer_text: qtype === 'fill_blank' || qtype === 'matching' ? (studentAnswer || 'No answer') :
          (studentAnswer ? (q[optionMap[studentAnswer]] || studentAnswer) : 'No answer'),
        correct_answer: correctAnswer,
        correct_answer_text: qtype === 'fill_blank' ? correctAnswer :
          qtype === 'matching' ? (q.passage || '') :
          (q[optionMap[correctAnswer]] || correctAnswer),
        is_correct: isCorrect,
      };
    });

    res.json({
      student_name: attempt.student_name,
      quiz_title: attempt.quiz_title,
      quiz_number: attempt.quiz_number,
      class_name: attempt.class_name,
      class_subject: attempt.class_subject,
      teacher_name: attempt.teacher_name,
      school_name: attempt.school_name || 'N/A',
      score: attempt.score,
      total: attempt.total,
      attempted_at: attempt.attempted_at,
      questions: detailed,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET quiz results for teacher
router.get('/:classId/quizzes/:quizId/results', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qa.*, u.name AS student_name, qz.title AS quiz_title
       FROM quiz_attempts qa
       JOIN users u ON qa.student_id = u.id
       JOIN quizzes qz ON qz.id = qa.quiz_id
       WHERE qa.quiz_id = $1 ORDER BY qa.score DESC`,
      [req.params.quizId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET detailed attempt for teacher download (questions + student answers + correct answers)
router.get('/:classId/quizzes/:quizId/attempts/:attemptId/detail', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const attemptResult = await pool.query(
      `SELECT
         qa.*,
         u.name  AS student_name,
         qz.title AS quiz_title,
         c.name   AS class_name,
         c.subject AS class_subject,
         t.name   AS teacher_name,
         s.name   AS school_name,
         (SELECT COUNT(*)::int FROM quizzes q2
          WHERE q2.class_id = qz.class_id AND q2.created_at <= qz.created_at) AS quiz_number
       FROM quiz_attempts qa
       JOIN users u   ON u.id  = qa.student_id
       JOIN quizzes qz ON qz.id = qa.quiz_id
       JOIN classes c  ON c.id  = qz.class_id
       JOIN users t   ON t.id  = c.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id
       WHERE qa.id = $1 AND qa.quiz_id = $2`,
      [req.params.attemptId, req.params.quizId]
    );
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }
    const attempt = attemptResult.rows[0];
    const answers = attempt.answers || {};

    const questionsResult = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );

    const optionMap = { a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d' };
    const detailed = questionsResult.rows.map((q, idx) => {
      const studentAnswer = (answers[String(q.id)] || '').toLowerCase();
      const correctAnswer = q.correct_answer;
      return {
        number: idx + 1,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        student_answer: studentAnswer || 'No answer',
        student_answer_text: studentAnswer ? (q[optionMap[studentAnswer]] || studentAnswer) : 'No answer',
        correct_answer: correctAnswer,
        correct_answer_text: q[optionMap[correctAnswer]],
        is_correct: studentAnswer === correctAnswer,
      };
    });

    res.json({
      student_name: attempt.student_name,
      quiz_title: attempt.quiz_title,
      quiz_number: attempt.quiz_number,
      class_name: attempt.class_name,
      class_subject: attempt.class_subject,
      teacher_name: attempt.teacher_name,
      school_name: attempt.school_name || 'N/A',
      score: attempt.score,
      total: attempt.total,
      attempted_at: attempt.attempted_at,
      questions: detailed,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE quiz (teacher)
router.delete('/:classId/quizzes/:quizId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM quizzes WHERE id = $1 AND class_id = $2', [req.params.quizId, req.params.classId]);
    res.json({ message: 'Quiz deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
