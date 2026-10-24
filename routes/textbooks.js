const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (e) { console.log('[textbooks] pdf-parse unavailable'); }

const router = express.Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

// ── Schema: units + student progress (created at startup) ───────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS textbook_units (
    id SERIAL PRIMARY KEY,
    textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    start_page INTEGER NOT NULL DEFAULT 1,
    end_page INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    exercise_quiz JSONB,
    unit_test_quiz JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS student_textbook_progress (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    unit_id INTEGER NOT NULL DEFAULT 0,
    kind VARCHAR(20) NOT NULL DEFAULT 'exercise',
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (student_id, textbook_id, unit_id, kind)
  );
  ALTER TABLE textbooks ADD COLUMN IF NOT EXISTS summative_quiz JSONB;
`).catch((e) => console.error('[textbooks] schema:', e.message));

// ── Helpers ─────────────────────────────────────────────────────────────────

function bookFilePath(book) {
  if (!book.file_path) return null;
  return path.join(__dirname, '../uploads/textbooks', book.file_path);
}

/**
 * Page texts for a book, unified across two storage modes:
 *  - has PDF file on disk → real page texts via pdf-parse
 *  - legacy books (text only) → content sliced into ~1800-char "pages"
 * pages[0] = page 1. Unit start_page/end_page indexes this array in BOTH modes.
 */
async function getBookPages(book) {
  const abs = bookFilePath(book);
  if (abs && pdfParse && fs.existsSync(abs)) return extractPageTexts(abs);
  const text = book.content || '';
  const pages = [];
  const size = 1800;
  for (let i = 0; i < text.length; i += size) {
    let end = i + size;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      const sp = text.lastIndexOf('. ', end);
      if (nl > i + size * 0.6) end = nl;
      else if (sp > i + size * 0.6) end = sp + 1;
    }
    pages.push(text.slice(i, end).trim());
    i = end - size; // eslint-disable-line
  }
  return pages.filter((p) => p.length > 0);
}

/** Extract per-page text from a textbook PDF. pages[0] = page 1. */
async function extractPageTexts(absPath) {
  const pages = [];
  const buf = fs.readFileSync(absPath);
  await pdfParse(buf, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((tc) => {
        const s = tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
        pages.push(s);
        return s;
      }),
  });
  return pages;
}

async function callGroq(messages, maxTokens = 6000, temperature = 0.4) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  const body = JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens: maxTokens });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body,
    });
    if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, 2500 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  throw new Error('Groq rate limited');
}

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON array in AI response');
  return JSON.parse(text.slice(start, end + 1));
}

/** AI-detect unit boundaries (title + page range) from per-page text. */
async function detectUnitsAI(book, pages) {
  const snippets = pages
    .slice(0, 400)
    .map((t, i) => `p${i + 1}: ${(t || '').slice(0, 90)}`)
    .filter((s) => s.length > 5)
    .join('\n');
  const raw = await callGroq([
    { role: 'system', content: 'You analyze Rwandan CBC school textbooks. Return ONLY a JSON array, no prose.' },
    {
      role: 'user',
      content: `Here is the first ~90 characters of each page of the textbook "${book.title}" (${book.subject}, ${book.grade_level}). The book has ${pages.length} pages.\n\n${snippets}\n\nIdentify the UNIT boundaries. Return a JSON array like [{"title":"Unit 1 — Numbers","start_page":9,"end_page":30},...] covering the units in order. Use the real unit titles found in the text. Ignore cover/front-matter pages (start units at the first real unit). Cover all content pages so every unit page belongs to a unit.`,
    },
  ], 4000, 0.2);
  const arr = extractJsonArray(raw);
  return arr
    .filter((u) => u && u.title)
    .map((u, i) => ({
      title: String(u.title).slice(0, 290),
      start_page: Math.max(1, Math.min(pages.length, parseInt(u.start_page, 10) || 1)),
      end_page: Math.max(1, Math.min(pages.length, parseInt(u.end_page, 10) || pages.length)),
      position: i,
    }))
    .filter((u) => u.end_page >= u.start_page);
}

/** Generate (and cache) an MCQ quiz for a unit or whole book. */
async function generateQuiz(book, unit, kind) {
  let text;
  let count;
  const pages = await getBookPages(book);
  if (kind === 'summative') {
    const units = (await pool.query('SELECT title, start_page, end_page FROM textbook_units WHERE textbook_id=$1 ORDER BY position', [book.id])).rows;
    const sampled = units.map((u) => `UNIT: ${u.title}\n${pages.slice(u.start_page - 1, u.end_page).join(' ').slice(0, 3500)}`).join('\n\n');
    text = sampled || (book.content || '').slice(0, 20000);
    count = 12;
  } else {
    text = pages.slice(unit.start_page - 1, unit.end_page).join(' ').slice(0, 15000);
    count = kind === 'unit_test' ? 10 : 8;
  }
  if (!text.trim()) throw new Error('This book has no readable text (scanned PDF).');

  const kindLabel = kind === 'exercise' ? 'practice exercises' : kind === 'unit_test' ? 'an end-of-unit test' : 'a summative assessment covering ALL units';
  const raw = await callGroq([
    { role: 'system', content: 'You write fair multiple-choice questions strictly from the provided textbook text for Rwandan CBC students. Return ONLY a JSON array, no prose.' },
    {
      role: 'user',
      content: `Create ${count} multiple-choice questions for ${kindLabel} of ${unit ? `the unit "${unit.title}" in ` : ''}the book "${book.title}" (${book.subject}, ${book.grade_level}). Each question must be answerable ONLY from the text below — test real understanding, not generic knowledge.\n\nTEXT:\n${text}\n\nReturn JSON: [{"question":"...","options":["A","B","C","D"],"answer":0}] where answer is the 0-based index of the correct option.`,
    },
  ], 6000, 0.5);
  const arr = extractJsonArray(raw);
  const questions = arr
    .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 4)
    .map((q) => ({ question: String(q.question), options: q.options.map(String), answer: Math.max(0, Math.min(3, parseInt(q.answer, 10) || 0)) }));
  if (!questions.length) throw new Error('AI returned no questions');
  return { questions, generated_at: new Date().toISOString() };
}

/** Ensure a book has units; lazily AI-detect them on first open. */
async function ensureUnits(book) {
  const existing = await pool.query('SELECT * FROM textbook_units WHERE textbook_id=$1 ORDER BY position', [book.id]);
  if (existing.rows.length) return existing.rows;

  try {
    const pages = await getBookPages(book);
    let units = pages.length ? await detectUnitsAI(book, pages) : [];
    if (!units.length) units = [{ title: 'Whole book', start_page: 1, end_page: pages.length || 1, position: 0 }];
    for (const u of units) {
      await pool.query('INSERT INTO textbook_units (textbook_id,title,start_page,end_page,position) VALUES ($1,$2,$3,$4,$5)', [book.id, u.title, u.start_page, u.end_page, u.position]);
    }
  } catch (e) {
    console.error('[textbooks] detect-units failed:', e.message);
    await pool.query('INSERT INTO textbook_units (textbook_id,title,start_page,end_page,position) VALUES ($1,$2,1,1,0)', [book.id, book.title]);
  }
  return (await pool.query('SELECT * FROM textbook_units WHERE textbook_id=$1 ORDER BY position', [book.id])).rows;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.VERCEL ? path.join('/tmp', 'uploads', 'textbooks') : path.join(__dirname, '../uploads/textbooks');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed.'));
  },
});

// GET all textbooks (any authenticated user)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, subject, grade_level, book_type, file_name, created_at FROM textbooks ORDER BY grade_level, subject, book_type',
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST upload textbook (admin only)
router.post('/', authenticateToken, requireRole('admin'), upload.single('file'), async (req, res) => {
  const { title, subject, grade_level, book_type } = req.body;
  if (!title || !subject || !grade_level || !book_type) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'title, subject, grade_level and book_type are required.' });
  }
  if (!req.file) return res.status(400).json({ error: 'PDF file is required.' });

  let extractedText = '';
  try {
    // Lazy-require pdf-parse to avoid issues if module not yet installed
    const pdfParse = require('pdf-parse');
    const fileBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(fileBuffer);
    extractedText = pdfData.text || '';
  } catch (e) {
    console.error('PDF text extraction failed:', e.message);
    // Non-fatal — store without text
    extractedText = '';
  }

  try {
    const result = await pool.query(
      `INSERT INTO textbooks (title, subject, grade_level, book_type, file_path, file_name, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, title, subject, grade_level, book_type, file_name, created_at`,
      [title, subject, grade_level, book_type, req.file.filename, req.file.originalname, extractedText],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('DB error saving textbook:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE textbook (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM textbooks WHERE id = $1 RETURNING file_path',
      [req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    const filePath = path.join(__dirname, '../uploads/textbooks', result.rows[0].file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: 'Deleted.' });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Student learning endpoints ──────────────────────────────────────────────

// My progress across all books (for library badges)
router.get('/mine/progress', authenticateToken, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT textbook_id, unit_id, kind, pct FROM student_textbook_progress WHERE student_id = $1`,
      [req.user.id]
    );
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Stream the PDF file (auth required)
router.get('/:id/file', authenticateToken, async (req, res) => {
  try {
    const book = (await pool.query('SELECT * FROM textbooks WHERE id=$1', [req.params.id])).rows[0];
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const abs = bookFilePath(book);
    if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'File missing.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(abs);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Text-mode pages for books without a stored PDF file
router.get('/:id/textpages', authenticateToken, async (req, res) => {
  try {
    const book = (await pool.query('SELECT * FROM textbooks WHERE id=$1', [req.params.id])).rows[0];
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const pages = await getBookPages(book);
    res.json({ pages });
  } catch (err) {
    console.error('[textbooks/textpages]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Book detail for learning: units + my progress
router.get('/:id/learn', authenticateToken, async (req, res) => {
  try {
    const book = (await pool.query(
      'SELECT id, title, subject, grade_level, book_type, file_name, file_path, content FROM textbooks WHERE id=$1',
      [req.params.id]
    )).rows[0];
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const units = await ensureUnits(book);
    const progress = (await pool.query(
      'SELECT unit_id, kind, score, total, pct FROM student_textbook_progress WHERE student_id=$1 AND textbook_id=$2',
      [req.user.id, book.id]
    )).rows;
    const hasFile = Boolean(book.file_path) && fs.existsSync(bookFilePath(book));
    const pageCount = hasFile ? null : Math.max(...units.map((u) => u.end_page), 1);
    res.json({
      book: { id: book.id, title: book.title, subject: book.subject, grade_level: book.grade_level, book_type: book.book_type },
      has_file: hasFile,
      page_count: pageCount,
      units: units.map((u) => ({ id: u.id, title: u.title, start_page: u.start_page, end_page: u.end_page, position: u.position })),
      progress,
    });
  } catch (err) {
    console.error('[textbooks/learn]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Admin: (re)detect units with AI
router.post('/:id/detect-units', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const book = (await pool.query('SELECT * FROM textbooks WHERE id=$1', [req.params.id])).rows[0];
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const pages = await getBookPages(book);
    if (!pages.length) return res.status(422).json({ error: 'No readable content in this book.' });
    const units = await detectUnitsAI(book, pages);
    if (!units.length) return res.status(422).json({ error: 'AI could not detect units in this book.' });
    await pool.query('DELETE FROM textbook_units WHERE textbook_id=$1', [book.id]);
    for (const u of units) {
      await pool.query('INSERT INTO textbook_units (textbook_id,title,start_page,end_page,position) VALUES ($1,$2,$3,$4,$5)', [book.id, u.title, u.start_page, u.end_page, u.position]);
    }
    const saved = await pool.query('SELECT id,title,start_page,end_page,position FROM textbook_units WHERE textbook_id=$1 ORDER BY position', [book.id]);
    res.json({ units: saved.rows });
  } catch (err) {
    console.error('[textbooks/detect-units]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get/generate a quiz for a unit (or whole-book summative when unitId=0)
router.get('/:id/units/:unitId/quiz', authenticateToken, async (req, res) => {
  const kind = ['exercise', 'unit_test', 'summative'].includes(req.query.kind) ? req.query.kind : 'exercise';
  try {
    const book = (await pool.query('SELECT * FROM textbooks WHERE id=$1', [req.params.id])).rows[0];
    if (!book) return res.status(404).json({ error: 'Book not found.' });

    const col = kind === 'exercise' ? 'exercise_quiz' : kind === 'unit_test' ? 'unit_test_quiz' : null;

    if (kind === 'summative') {
      if (book.summative_quiz?.questions?.length) return res.json({ kind, questions: book.summative_quiz.questions, cached: true });
      const quiz = await generateQuiz(book, null, 'summative');
      await pool.query('UPDATE textbooks SET summative_quiz=$1 WHERE id=$2', [JSON.stringify(quiz), book.id]);
      return res.json({ kind, questions: quiz.questions });
    }

    const unit = (await pool.query('SELECT * FROM textbook_units WHERE id=$1 AND textbook_id=$2', [req.params.unitId, book.id])).rows[0];
    if (!unit) return res.status(404).json({ error: 'Unit not found.' });

    const cached = unit[col];
    if (cached?.questions?.length) return res.json({ kind, questions: cached.questions, cached: true });
    const quiz = await generateQuiz(book, unit, kind);
    await pool.query(`UPDATE textbook_units SET ${col}=$1 WHERE id=$2`, [JSON.stringify(quiz), unit.id]);
    res.json({ kind, questions: quiz.questions });
  } catch (err) {
    console.error('[textbooks/quiz]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Record a quiz result (exercise / unit_test / summative)
router.post('/:id/result', authenticateToken, requireRole('student', 'alumni', 'guest', 'teacher', 'head_teacher', 'admin'), async (req, res) => {
  const unitId = Math.max(0, parseInt(req.body.unit_id, 10) || 0);
  const kind = ['exercise', 'unit_test', 'summative'].includes(req.body.kind) ? req.body.kind : 'exercise';
  const score = Math.max(0, parseInt(req.body.score, 10) || 0);
  const total = Math.max(1, parseInt(req.body.total, 10) || 1);
  const pct = Math.round((score / total) * 10000) / 100;
  try {
    await pool.query(
      `INSERT INTO student_textbook_progress (student_id, textbook_id, unit_id, kind, score, total, pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (student_id, textbook_id, unit_id, kind)
       DO UPDATE SET score=GREATEST(student_textbook_progress.score,$5),
                     total=$6, pct=GREATEST(student_textbook_progress.pct,$7),
                     created_at=NOW()`,
      [req.user.id, req.params.id, unitId, kind, score, total, pct]
    );
    res.json({ ok: true, pct });
  } catch (err) {
    console.error('[textbooks/result]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
