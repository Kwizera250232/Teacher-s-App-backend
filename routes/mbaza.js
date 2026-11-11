const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

async function callGroq(messages, maxTokens = 3000, temperature = 0.4) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.choices?.[0]?.message?.content || null;
}

const PERSONA = `You are MBAZA, a kind personal teacher for a Rwandan school student. Speak like a warm human teacher, simple English, encouraging, short paragraphs. Teach SLOWLY like a real teacher at the board: small steps, simple words, then 1-2 worked examples and a tip to remember. Use markdown: **bold** for key terms, bullet lists, and formulas written clearly (e.g. "Area = length × width").`;

// GET /api/mbaza/books — the AI textbooks MBAZA can teach from
router.get('/books', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT id, title, subject, grade_level FROM textbooks ORDER BY grade_level, subject LIMIT 60`
    )).rows;
    res.json({ books: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load books.' }); }
});

// Pull the real unit text out of a book's stored content (pages split on blank lines)
function textbookPages(book) {
  return String(book.content || '').split(/\n\s*\n/).map(p => p.replace(/\s+$/, '')).filter(p => p.trim().length > 0);
}

async function findUnitText(question) {
  const m = question.match(/unit\s*(\d+)|umutwe\s*(?:wa\s*)?(\d+)/i);
  const unitNo = m ? parseInt(m[1] || m[2], 10) : null;
  const books = (await pool.query(
    `SELECT id, title, subject, grade_level, content FROM textbooks WHERE content IS NOT NULL AND content <> '' ORDER BY id LIMIT 60`
  )).rows;
  if (!books.length) return null;
  const q = question.toLowerCase();
  const book = books.find(b =>
    (b.subject || '').toLowerCase().split(/\W+/).some(w => w.length > 2 && q.includes(w)) ||
    (b.title || '').toLowerCase().split(/\W+/).some(w => w.length > 4 && q.includes(w))
  ) || books[0];
  const pages = textbookPages(book);
  const units = (await pool.query(
    `SELECT title, start_page, end_page FROM textbook_units WHERE textbook_id=$1 ORDER BY start_page NULLS LAST, id`,
    [book.id]
  )).rows.filter(u => u.start_page != null);
  if (unitNo) {
    const unit = units.find(u => new RegExp('(unit|umutwe)\\D*' + unitNo, 'i').test(u.title || '')) || units[unitNo - 1];
    if (unit) {
      const text = pages.slice(unit.start_page - 1, Math.min(unit.end_page || pages.length, unit.start_page + 13)).join('\n\n');
      return { book, unit, text };
    }
  }
  return { book, unit: null, text: pages.slice(0, 2).join('\n\n'), unitList: units.map(u => u.title).slice(0, 12) };
}

// GET /api/mbaza/weak-marks — quiz results below 90%
router.get('/weak-marks', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT q.title, qa.score, qa.total, qa.created_at, ROUND(qa.score::numeric / NULLIF(qa.total,0) * 100) AS pct
       FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
       WHERE qa.student_id = $1 AND qa.total > 0 AND (qa.score::numeric / qa.total) < 0.9
       ORDER BY pct ASC, qa.created_at DESC LIMIT 15`, [req.user.id]
    )).rows;
    res.json({ weak: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load marks.' }); }
});

// POST /api/mbaza/ask — explain anything, teacher-voice answer
router.post('/ask', authenticateToken, requireRole('student'), async (req, res) => {
  const q = String(req.body.question || '').slice(0, 2000);
  if (!q.trim()) return res.status(400).json({ error: 'question is required.' });
  try {
    const unitCtx = /unit|book|lesson|umutwe|chapter/i.test(q) ? await findUnitText(q).catch(() => null) : null;
    const bookInfo = unitCtx
      ? `\nUse THIS real textbook content ("${unitCtx.unit?.title || unitCtx.book.title}" of ${unitCtx.book.title} — ${unitCtx.book.subject} ${unitCtx.book.grade_level}) as the source for your teaching. Teach exactly from it, step by step, like a teacher reading the book aloud and explaining slowly with examples.${unitCtx.unitList?.length ? `\nThe book's units are: ${unitCtx.unitList.join(' | ')} — tell the student which unit to ask for if they want another.` : ''}\nBOOK TEXT:\n${(unitCtx.text || '').slice(0, 8000)}`
      : '';
    const answer = await callGroq([
      { role: 'system', content: PERSONA + ' The student asked to explain or help with a lesson. Search your knowledge and give correct, real school-level content.' + bookInfo },
      { role: 'user', content: q },
    ]);
    res.json({ answer: answer || 'Sorry, my teaching notes are unavailable right now — try again in a moment.' });
  } catch (e) { res.status(500).json({ error: 'Could not answer right now.' }); }
});

// POST /api/mbaza/exercise — generate a short practice quiz (JSON MCQs)
router.post('/exercise', authenticateToken, requireRole('student'), async (req, res) => {
  const topic = String(req.body.topic || 'general school revision').slice(0, 300);
  try {
    const out = await callGroq([
      { role: 'system', content: 'You are a Rwandan school teacher writing a short practice quiz. Reply with ONLY valid JSON: {"questions":[{"q":"...","options":["A","B","C","D"],"answer":0}]} — exactly 5 questions, answer = index of correct option.' },
      { role: 'user', content: `Make 5 practice questions about: ${topic}` },
    ], 2000, 0.5);
    let quiz = [];
    try { quiz = JSON.parse(out.replace(/```json|```/g, '').trim()).questions || []; } catch { quiz = []; }
    res.json({ questions: quiz.slice(0, 5) });
  } catch (e) { res.status(500).json({ error: 'Could not make exercises.' }); }
});

module.exports = router;
