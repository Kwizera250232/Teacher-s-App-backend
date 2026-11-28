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
    exam_type VARCHAR(50) DEFAULT 'National Exam',
    description TEXT,
    duration_minutes INTEGER DEFAULT 120,
    is_published BOOLEAN DEFAULT TRUE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_pp_exams_year ON past_paper_exams(year);
  CREATE INDEX IF NOT EXISTS idx_pp_exams_subject ON past_paper_exams(subject);
  CREATE INDEX IF NOT EXISTS idx_pp_exams_type ON past_paper_exams(exam_type);

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

  ALTER TABLE past_paper_exams ADD COLUMN IF NOT EXISTS exam_type VARCHAR(50) DEFAULT 'National Exam';
  CREATE INDEX IF NOT EXISTS idx_pp_exams_type ON past_paper_exams(exam_type);
`).catch(e => console.error('[past-papers] schema:', e.message));

// ── Premium gate — same rule as REB Textbooks: a student who paid ANY
// teacher's class unlocks premium features. Staff/alumni are never gated. ──
async function unpaidPremiumClasses(studentId) {
  const r = await pool.query(
    `SELECT s.class_id, s.amount_rwf, c.name AS class_name
       FROM class_payment_settings s
       JOIN classes c ON c.id = s.class_id
      WHERE s.enabled AND s.amount_rwf > 0
        AND NOT EXISTS (SELECT 1 FROM class_payments p2 WHERE p2.student_id = $1
                        AND p2.status = 'SUCCESSFUL' AND p2.expires_at > NOW())
        AND EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = s.class_id AND m.student_id = $1)
        AND NOT EXISTS (SELECT 1 FROM class_payments p WHERE p.class_id = s.class_id
                        AND p.student_id = $1 AND p.status = 'SUCCESSFUL' AND p.expires_at > NOW())`,
    [studentId]
  );
  return r.rows;
}

async function pastPapersGate(req, res) {
  if (req.user.role !== 'student') return false;
  try {
    const unpaid = await unpaidPremiumClasses(req.user.id);
    if (!unpaid.length) return false;
    const c = unpaid[0];
    res.status(402).json({
      error: `📜 Past Papers is a premium feature of your class "${c.class_name}" — pay for class access to practice national exams.`,
      premium_required: true,
      class_id: c.class_id,
      class_name: c.class_name,
      amount_rwf: c.amount_rwf,
    });
    return true;
  } catch {
    return false;
  }
}

// Access status for the student page (lock banner + pay CTA)
router.get('/access', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.json({ premium_required: false });
    const unpaid = await unpaidPremiumClasses(req.user.id);
    res.json({
      premium_required: unpaid.length > 0,
      classes: unpaid.map((c) => ({ class_id: c.class_id, class_name: c.class_name, amount_rwf: c.amount_rwf })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

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

// ── Groq helper — powers AI question generation for admins ───────────────────
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
async function callGroqText(messages, maxTokens = 8192, temperature = 0.3) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens: maxTokens }),
    });
    if (res.status === 429 && attempt < 2) {
      const waitMs = parseInt(res.headers.get('retry-after') || '0', 10) * 1000 || (attempt + 1) * 2000;
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }
  throw new Error('Groq API: max retries exceeded');
}

/** Extract a JSON array from an AI response (tolerates markdown fences). */
function parseJsonArray(text) {
  const clean = String(text || '').replace(/```json|```/g, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return []; }
}

// ── Web search helper (SearXNG, same as AI Quiz Gen) — grounds AI answers ─────
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888';
async function searchWeb(query, numResults = 5) {
  try {
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&pageno=1`;
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, numResults).map(r => ({
      title: r.title || '', content: r.content || '', url: r.url || '',
    }));
  } catch { return []; }
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (students/alumni)
// ════════════════════════════════════════════════════════════════════════════

// ── Get available years ──────────────────────────────────────────────────────
router.get('/years', authenticateToken, async (req, res) => {
  if (await pastPapersGate(req, res)) return;
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
  if (await pastPapersGate(req, res)) return;
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

// ── Get exam types for a year + subject ──────────────────────────────────────
router.get('/exam-types/:year/:subject', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT exam_type FROM past_paper_exams WHERE year=$1 AND subject ILIKE $2 AND is_published=TRUE ORDER BY exam_type`,
      [parseInt(req.params.year), `%${req.params.subject}%`]
    );
    res.json({ exam_types: result.rows.map(r => r.exam_type) });
  } catch (err) {
    console.error('[past-papers/exam-types]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get all questions for a year + subject + exam_type (for AI quiz generation) ──
router.get('/questions/:year/:subject', authenticateToken, async (req, res) => {
  if (await pastPapersGate(req, res)) return;
  const { exam_type } = req.query;
  try {
    let query, params;
    if (exam_type) {
      query = `
        SELECT pp.question, pp.option_a, pp.option_b, pp.option_c, pp.option_d, pp.correct_answer,
               e.title as exam_title, e.year, e.subject, e.class_level, e.exam_type
        FROM past_paper_questions pp
        JOIN past_paper_exams e ON e.id = pp.exam_id
        WHERE e.year = $1 AND e.subject ILIKE $2 AND e.exam_type = $3 AND e.is_published = TRUE
        ORDER BY pp.order_num, pp.id`;
      params = [parseInt(req.params.year), `%${req.params.subject}%`, exam_type];
    } else {
      query = `
        SELECT pp.question, pp.option_a, pp.option_b, pp.option_c, pp.option_d, pp.correct_answer,
               e.title as exam_title, e.year, e.subject, e.class_level, e.exam_type
        FROM past_paper_questions pp
        JOIN past_paper_exams e ON e.id = pp.exam_id
        WHERE e.year = $1 AND e.subject ILIKE $2 AND e.is_published = TRUE
        ORDER BY pp.order_num, pp.id`;
      params = [parseInt(req.params.year), `%${req.params.subject}%`];
    }
    const result = await pool.query(query, params);
    res.json({ questions: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[past-papers/questions]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get exams for a year + subject ───────────────────────────────────────────
router.get('/exams/:year/:subject', authenticateToken, async (req, res) => {
  if (await pastPapersGate(req, res)) return;
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
  if (await pastPapersGate(req, res)) return;
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
  if (await pastPapersGate(req, res)) return;
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

// POST /admin/generate-questions — paste a real national exam, AI returns MCQs.
// Questions are returned to the admin for review/edit before saving — no exam
// is created here, so the existing take/grade flow is untouched.
router.post('/admin/generate-questions', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { exam_text, subject = '', max_questions = 25 } = req.body;
  const text = String(exam_text || '').trim();
  if (text.length < 80) {
    return res.status(400).json({ error: 'Paste the full exam text (at least 80 characters).' });
  }
  const cap = Math.min(Math.max(parseInt(max_questions, 10) || 25, 1), 50);
  try {
    // Ground answers with web context — find the real exam/marking guide online
    const examYear = req.body.year || '';
    const queries = [
      `${subject} ${examYear} national exam Rwanda answers marking guide`.trim(),
      `${subject} national examination paper ${examYear} answer key`.trim(),
    ];
    const searchResults = (await Promise.all(queries.map(q => searchWeb(q, 4)))).flat();
    const webContext = searchResults
      .map(r => `${r.title}: ${r.content}`)
      .filter(s => s.length > 10)
      .join('\n')
      .slice(0, 6000);

    const prompt = `You are converting a REAL exam paper into multiple-choice questions for Rwandan students (${subject || 'General subject'}).

Below is the raw pasted exam text (national exam style — may contain section headers, instructions, numbering, or essay prompts). Extract up to ${cap} of the most important questions.

WORDING RULES — VERY IMPORTANT:
- Copy each question's stem EXACTLY as written in the source text. Do NOT rephrase, paraphrase, simplify, or change any vocabulary. The original wording must be preserved verbatim — this is a real past paper and students must see the authentic question.
- Keep the original numbering context if it exists in the text (e.g. "Question 12").
- Only fix obvious OCR/paste artifacts (broken characters, missing spaces), never the wording itself.

ANSWER RULES:
- "correct_answer" must be the REAL correct answer — verify it carefully. Use the web reference material below when provided, plus your own knowledge. Think twice: a wrong key teaches students the wrong thing.
- For math/science questions, actually work out the answer, don't guess.
- If the source is an open/essay/calculation question, keep its wording verbatim but convert to MCQ: the correct option is the real answer, the other 3 are plausible distractors.
- If the source is already MCQ, keep the original options verbatim (fill missing options only if absent).

EXPLANATION:
- "explanation" = 1-2 sentences showing WHY the answer is correct (show the working for math).

OUTPUT FORMAT — ONLY a JSON array, no markdown, no extra text:
[{"question":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"a","explanation":"..."}]
${webContext ? `\nWEB REFERENCE (use to verify answers):\n${webContext}\n` : ''}
EXAM TEXT:
${text.slice(0, 24000)}`;

    const raw = await callGroqText([{ role: 'user', content: prompt }], 16000);
    const arr = parseJsonArray(raw);
    const questions = (Array.isArray(arr) ? arr : [])
      .filter(q => q && q.question && q.option_a && q.option_b && q.option_c && q.option_d && ['a','b','c','d'].includes(String(q.correct_answer || '').toLowerCase()))
      .slice(0, cap)
      .map(q => ({
        question: String(q.question).trim(),
        option_a: String(q.option_a).trim(),
        option_b: String(q.option_b).trim(),
        option_c: String(q.option_c).trim(),
        option_d: String(q.option_d).trim(),
        correct_answer: String(q.correct_answer).toLowerCase(),
        explanation: String(q.explanation || '').trim(),
      }));
    if (!questions.length) {
      return res.status(502).json({ error: 'AI could not extract questions — check the pasted text and try again.' });
    }

    // Second pass — a separate AI call double-checks every answer key and
    // explanation, fixing mistakes. Question wording is left untouched.
    let verified = questions;
    try {
      const checkPrompt = `You are an examiner checking an answer key for a ${subject || 'General'} exam. For EACH question below, verify that "correct_answer" is truly correct (work it out yourself${webContext ? ', using the reference material' : ''}). If a key is wrong, fix it and rewrite the explanation. Do NOT change the question text or the options — only correct_answer and explanation.

Return ONLY the corrected JSON array in the exact same format and order.

QUESTIONS:
${JSON.stringify(questions)}
${webContext ? `\nWEB REFERENCE:\n${webContext.slice(0, 3000)}` : ''}`;
      const vraw = await callGroqText([{ role: 'user', content: checkPrompt }], 12000);
      const varr = parseJsonArray(vraw);
      if (Array.isArray(varr) && varr.length === questions.length) {
        verified = varr.map((v, i) => ({
          ...questions[i], // never trust the verifier with wording/options
          correct_answer: ['a','b','c','d'].includes(String(v?.correct_answer || '').toLowerCase())
            ? String(v.correct_answer).toLowerCase()
            : questions[i].correct_answer,
          explanation: String(v?.explanation || questions[i].explanation || '').trim(),
        }));
      }
    } catch (e) {
      console.error('[past-papers/verify]', e.message); // verification failure still returns generated questions
    }

    res.json({ questions: verified });
  } catch (e) {
    console.error('[past-papers/generate]', e.message);
    res.status(500).json({ error: e.message.includes('Groq') ? 'AI service error — try again in a moment.' : 'Generation failed.' });
  }
});

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
  const { title, subject, year, class_level, exam_type, description, duration_minutes, questions } = req.body;
  if (!title?.trim() || !subject?.trim() || !year) {
    return res.status(400).json({ error: 'Title, subject, and year are required.' });
  }
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'At least one question is required.' });
  }

  try {
    const examRes = await pool.query(
      `INSERT INTO past_paper_exams (title, subject, year, class_level, exam_type, description, duration_minutes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [title.trim(), subject.trim(), parseInt(year), class_level || null, exam_type || 'National Exam', description || null, parseInt(duration_minutes) || 120, req.user.id]
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
