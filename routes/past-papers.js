const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ── Schema migration (safe to run on existing DB) ────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS past_paper_exams (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    year INTEGER NOT NULL,
    class_level VARCHAR(50),
    description TEXT,
    duration_minutes INTEGER DEFAULT 120,
    is_published BOOLEAN DEFAULT TRUE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_pp_exams_year ON past_paper_exams(year);
  CREATE INDEX IF NOT EXISTS idx_pp_exams_subject ON past_paper_exams(subject);

  CREATE TABLE IF NOT EXISTS past_paper_questions (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES past_paper_exams(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    option_a VARCHAR(500) NOT NULL,
    option_b VARCHAR(500) NOT NULL,
    option_c VARCHAR(500),
    option_d VARCHAR(500),
    correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('a','b','c','d')),
    explanation TEXT,
    order_num INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_pp_questions_exam ON past_paper_questions(exam_id);

  CREATE TABLE IF NOT EXISTS past_paper_attempts (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES past_paper_exams(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    percentage NUMERIC(5,2) DEFAULT 0,
    answers JSONB DEFAULT '{}',
    ai_feedback TEXT,
    time_taken_seconds INTEGER,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_pp_attempts_exam ON past_paper_attempts(exam_id);
  CREATE INDEX IF NOT EXISTS idx_pp_attempts_student ON past_paper_attempts(student_id);
`).catch(e => console.error('[past-papers] schema:', e.message));

// ── Gemini AI helper ──────────────────────────────────────────────────────────
async function callGemini(prompt, maxTokens = 800) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (students/alumni)
// ════════════════════════════════════════════════════════════════════════════

// ── Get available years ──────────────────────────────────────────────────────
router.get('/years', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT year FROM past_paper_exams WHERE is_published=TRUE ORDER BY year DESC`
    );
    res.json({ years: result.rows.map(r => r.year) });
  } catch (err) {
    console.error('[past-papers/years]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get subjects for a year ──────────────────────────────────────────────────
router.get('/subjects/:year', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT subject FROM past_paper_exams WHERE year=$1 AND is_published=TRUE ORDER BY subject`,
      [parseInt(req.params.year)]
    );
    res.json({ subjects: result.rows.map(r => r.subject) });
  } catch (err) {
    console.error('[past-papers/subjects]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get exams for a year + subject ───────────────────────────────────────────
router.get('/exams/:year/:subject', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.title, e.subject, e.year, e.class_level, e.description, e.duration_minutes,
        (SELECT COUNT(*) FROM past_paper_questions WHERE exam_id=e.id) as question_count,
        (SELECT COUNT(*) FROM past_paper_attempts WHERE exam_id=e.id AND student_id=$3 AND completed_at IS NOT NULL) as my_attempts
       FROM past_paper_exams e
       WHERE e.year=$1 AND e.subject ILIKE $2 AND e.is_published=TRUE
       ORDER BY e.title`,
      [parseInt(req.params.year), `%${req.params.subject}%`, req.user.id]
    );
    res.json({ exams: result.rows });
  } catch (err) {
    console.error('[past-papers/exams]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get exam questions (for taking the exam) ─────────────────────────────────
router.get('/exam/:id', authenticateToken, async (req, res) => {
  try {
    const exam = await pool.query(
      `SELECT id, title, subject, year, class_level, description, duration_minutes FROM past_paper_exams WHERE id=$1 AND is_published=TRUE`,
      [req.params.id]
    );
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found.' });

    const questions = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, order_num FROM past_paper_questions WHERE exam_id=$1 ORDER BY order_num, id`,
      [req.params.id]
    );

    res.json({
      exam: exam.rows[0],
      questions: questions.rows.map(q => ({
        id: q.id,
        question: q.question,
        options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
        order_num: q.order_num,
      })),
    });
  } catch (err) {
    console.error('[past-papers/exam]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Submit exam answers ──────────────────────────────────────────────────────
router.post('/exam/:id/submit', authenticateToken, async (req, res) => {
  const { answers, time_taken_seconds } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Answers are required.' });
  }
  try {
    const examRes = await pool.query('SELECT * FROM past_paper_exams WHERE id=$1', [req.params.id]);
    if (examRes.rows.length === 0) return res.status(404).json({ error: 'Exam not found.' });

    const questions = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, explanation FROM past_paper_questions WHERE exam_id=$1 ORDER BY order_num, id`,
      [req.params.id]
    );
    if (questions.rows.length === 0) return res.status(400).json({ error: 'No questions in this exam.' });

    let score = 0;
    const detailed = questions.rows.map(q => {
      const studentAnswer = answers[q.id] || null;
      const isCorrect = studentAnswer === q.correct_answer;
      if (isCorrect) score++;
      return {
        question_id: q.id,
        question: q.question,
        options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
        correct_answer: q.correct_answer,
        student_answer: studentAnswer,
        is_correct: isCorrect,
        explanation: q.explanation || null,
      };
    });

    const total = questions.rows.length;
    const percentage = Math.round((score / total) * 100);
    const grade = percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : 'F';
    const performanceLevel = percentage >= 80 ? 'Excellent' : percentage >= 70 ? 'Very Good' : percentage >= 60 ? 'Good' : percentage >= 50 ? 'Fair' : 'Needs Improvement';

    // Generate AI feedback
    let aiFeedback = '';
    try {
      const wrongQuestions = detailed.filter(d => !d.is_correct).map(d => d.question).slice(0, 5);
      const prompt = `You are an education AI assistant for Rwandan students. Analyze this past paper exam result and give personalized feedback in English (max 200 words).

Student took: ${examRes.rows[0].title} (${examRes.rows[0].subject}, ${examRes.rows[0].year})
Score: ${score}/${total} (${percentage}%) - Grade: ${grade} - ${performanceLevel}
Wrong questions topics: ${wrongQuestions.length > 0 ? wrongQuestions.join('; ') : 'None - all correct!'}

Give encouraging, specific feedback. Mention what topics to review. Keep it concise and motivating.`;
      aiFeedback = await callGemini(prompt, 800);
    } catch (e) {
      console.error('[past-papers/feedback]', e.message);
      aiFeedback = `You scored ${percentage}%. ${performanceLevel} performance. ${percentage >= 60 ? 'Keep up the good work!' : 'Keep practicing to improve your scores.'} ${total - score > 0 ? `Review the ${total - score} questions you got wrong and try again.` : 'Excellent - you got everything right!'}`;
    }

    // Save attempt
    const attempt = await pool.query(
      `INSERT INTO past_paper_attempts (exam_id, student_id, score, total, percentage, answers, ai_feedback, time_taken_seconds, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
      [req.params.id, req.user.id, score, total, percentage, JSON.stringify(answers), aiFeedback, time_taken_seconds || null]
    );

    res.json({
      attempt_id: attempt.rows[0].id,
      score, total, percentage, grade,
      performance_level: performanceLevel,
      ai_feedback: aiFeedback,
      detailed,
    });
  } catch (err) {
    console.error('[past-papers/submit]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get user's past paper attempt history ────────────────────────────────────
router.get('/my-attempts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, e.title, e.subject, e.year
       FROM past_paper_attempts a
       JOIN past_paper_exams e ON e.id = a.exam_id
       WHERE a.student_id = $1 AND a.completed_at IS NOT NULL
       ORDER BY a.completed_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ attempts: result.rows });
  } catch (err) {
    console.error('[past-papers/my-attempts]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── ADMIN: List all exams ────────────────────────────────────────────────────
router.get('/admin/exams', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*,
        (SELECT COUNT(*) FROM past_paper_questions WHERE exam_id=e.id) as question_count,
        (SELECT COUNT(*) FROM past_paper_attempts WHERE exam_id=e.id AND completed_at IS NOT NULL) as attempt_count,
        u.name as creator_name
      FROM past_paper_exams e
      JOIN users u ON u.id = e.created_by
      ORDER BY e.created_at DESC
    `);
    res.json({ exams: result.rows });
  } catch (err) {
    console.error('[past-papers/admin/exams]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Create a new exam with questions ──────────────────────────────────
router.post('/admin/exams', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, subject, year, class_level, description, duration_minutes, questions } = req.body;
  if (!title?.trim() || !subject?.trim() || !year) {
    return res.status(400).json({ error: 'Title, subject, and year are required.' });
  }
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'At least one question is required.' });
  }

  try {
    const examRes = await pool.query(
      `INSERT INTO past_paper_exams (title, subject, year, class_level, description, duration_minutes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [title.trim(), subject.trim(), parseInt(year), class_level || null, description || null, parseInt(duration_minutes) || 120, req.user.id]
    );
    const examId = examRes.rows[0].id;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question?.trim() || !q.option_a?.trim() || !q.option_b?.trim() || !q.correct_answer) continue;
      await pool.query(
        `INSERT INTO past_paper_questions (exam_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation, order_num)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [examId, q.question.trim(), q.option_a.trim(), q.option_b.trim(), q.option_c || null, q.option_d || null, q.correct_answer, q.explanation || null, i]
      );
    }

    res.status(201).json({ id: examId, message: 'Past paper exam created successfully.' });
  } catch (err) {
    console.error('[past-papers/admin/create]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Get exam detail with questions ────────────────────────────────────
router.get('/admin/exams/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const exam = await pool.query('SELECT * FROM past_paper_exams WHERE id=$1', [req.params.id]);
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Exam not found.' });
    const questions = await pool.query(
      'SELECT * FROM past_paper_questions WHERE exam_id=$1 ORDER BY order_num, id',
      [req.params.id]
    );
    res.json({ exam: exam.rows[0], questions: questions.rows });
  } catch (err) {
    console.error('[past-papers/admin/exam]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Delete exam ───────────────────────────────────────────────────────
router.delete('/admin/exams/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM past_paper_exams WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[past-papers/admin/delete]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Get attempts for an exam ──────────────────────────────────────────
router.get('/admin/exams/:id/attempts', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name as student_name, u.email as student_email
       FROM past_paper_attempts a
       JOIN users u ON u.id = a.student_id
       WHERE a.exam_id=$1 AND a.completed_at IS NOT NULL
       ORDER BY a.completed_at DESC`,
      [req.params.id]
    );
    res.json({ attempts: result.rows });
  } catch (err) {
    console.error('[past-papers/admin/attempts]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Stats ─────────────────────────────────────────────────────────────
router.get('/admin/stats', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const [exams, attempts, bySubject] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM past_paper_exams'),
      pool.query('SELECT COUNT(*) as total FROM past_paper_attempts WHERE completed_at IS NOT NULL'),
      pool.query('SELECT e.subject, COUNT(a.id) as attempts, AVG(a.percentage) as avg_score FROM past_paper_exams e LEFT JOIN past_paper_attempts a ON a.exam_id=e.id AND a.completed_at IS NOT NULL GROUP BY e.subject ORDER BY attempts DESC LIMIT 10'),
    ]);
    res.json({
      total_exams: exams.rows[0].total,
      total_attempts: attempts.rows[0].total,
      by_subject: bySubject.rows,
    });
  } catch (err) {
    console.error('[past-papers/admin/stats]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
