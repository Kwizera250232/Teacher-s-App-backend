const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888';

async function callGroq(messages, maxTokens = 8000, temperature = 0.5) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq error ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

// Web search via self-hosted SearXNG — same pattern as the AI quiz generator.
async function searchWeb(query, numResults = 4) {
  try {
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&pageno=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, numResults).map(r => ({
      title: r.title || '', content: r.content || '', url: r.url || '',
    }));
  } catch {
    return [];
  }
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_notes (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      subject TEXT,
      class_name TEXT,
      language TEXT,
      note_type TEXT,
      html TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_teacher_notes ON teacher_notes(teacher_id, created_at DESC)');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── POST /generate — AI teaching notes from web + UClass context ──
router.post('/generate', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    const { classLevel, subject, topic, language, noteType, objectives } = req.body || {};
    if (!topic || !subject) return res.status(400).json({ error: 'Subject and topic are required.' });

    const lang = ['English', 'Kinyarwanda', 'French'].includes(language) ? language : 'English';
    const typeLabel = noteType === 'brief'
      ? 'Brief revision notes'
      : noteType === 'detailed'
        ? 'Detailed notes with worked examples and activities'
        : 'Complete classroom notes';

    // Gather context in parallel: web search (REB/CBC + topic) + related UClass note titles
    const queries = [
      `Rwanda CBC ${subject} ${topic} ${classLevel || ''} competence based curriculum`,
      `${topic} ${subject} primary school teaching notes`,
    ];
    const [web1, web2, uclassNotes] = await Promise.all([
      searchWeb(queries[0]),
      searchWeb(queries[1]),
      pool.query(
        `SELECT n.title, c.subject FROM notes n JOIN classes c ON c.id = n.class_id
         WHERE n.title ILIKE $1 LIMIT 6`,
        [`%${String(topic).slice(0, 60)}%`]
      ).catch(() => ({ rows: [] })),
    ]);

    const webCtx = [...web1, ...web2].slice(0, 6)
      .map(r => `- ${r.title}: ${String(r.content || '').slice(0, 220)}`).join('\n');
    const uclassCtx = uclassNotes.rows.length
      ? uclassNotes.rows.map(n => `- ${n.title} (${n.subject || 'class material'})`).join('\n')
      : '';

    const prompt = [
      `You are an expert Rwandan ${subject} teacher preparing ${typeLabel} for ${classLevel || 'a primary class'} following the REB Competence-Based Curriculum (CBC).`,
      '',
      `Topic / unit: ${topic}`,
      `Subject: ${subject}`,
      `Class level: ${classLevel || 'Primary'}`,
      objectives ? `Learning objectives (from the teacher's lesson plan): ${objectives}` : '',
      `Write ALL notes in ${lang}.`,
      '',
      'Structure — use exactly these sections (as <h2> headings):',
      '1. Topic and Learning Objectives',
      '2. Introduction (connect to learners\u2019 everyday experiences)',
      '3. Key Concepts and Vocabulary (definitions as a bullet list)',
      '4. Detailed Explanations (use <h3> subheadings appropriate to the class level)',
      '5. Examples and Illustrations (worked examples where appropriate)',
      '6. Class Activities (individual work, pair work, and group activities)',
      '7. Summary (key ideas learners must remember)',
      '8. Revision Questions (mix of question types)',
      '9. Answers / Teacher\u2019s Guide (in a clearly separated final section)',
      '',
      'Rules:',
      '- Rich, correct, age-appropriate language; content MUST be specific to this exact topic.',
      '- Output ONLY HTML using <h2>, <h3>, <p>, <ul>, <li>, <ol>, <strong>, <em> — no <html>/<body>/markdown.',
      '- Do not claim a curriculum reference you cannot verify; write "aligned to REB CBC" only in spirit, not as an official document quote.',
      webCtx ? `\nReference material found online (use for accuracy, do not copy):\n${webCtx}` : '',
      uclassCtx ? `\nRelated UClass materials on this topic (you may mention them under Class Activities):\n${uclassCtx}` : '',
    ].filter(Boolean).join('\n');

    const raw = await callGroq([
      { role: 'system', content: 'You produce structured teaching notes as HTML for Rwandan CBC teachers.' },
      { role: 'user', content: prompt },
    ]);
    const html = String(raw || '').replace(/```html|```/g, '').trim();
    if (!html || html.length < 100) return res.json({ ai: false });
    res.json({ ai: true, html });
  } catch (err) {
    console.error('[teacher notes generate]', err.message);
    res.json({ ai: false });
  }
});

// ── Saved notes (My Resources) ──
router.post('/', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureSchema();
    const html = String(req.body.html || '');
    if (!html.trim() || html.length > 500000) return res.status(400).json({ error: 'Notes content is missing.' });
    const r = await pool.query(
      `INSERT INTO teacher_notes (teacher_id, title, subject, class_name, language, note_type, html)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
      [req.user.id,
       String(req.body.title || '').slice(0, 200),
       String(req.body.subject || '').slice(0, 120),
       String(req.body.class_name || '').slice(0, 60),
       String(req.body.language || '').slice(0, 30),
       String(req.body.note_type || '').slice(0, 60),
       html]
    );
    res.json({ saved: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
  } catch (err) {
    console.error('[teacher notes save]', err.message);
    res.status(500).json({ error: 'Could not save the notes.' });
  }
});

router.get('/', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureSchema();
    const r = await pool.query(
      `SELECT id, title, subject, class_name, language, note_type, created_at
       FROM teacher_notes WHERE teacher_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ notes: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Teacher's saved lesson plans — for "Generate from a lesson plan"
router.get('/plans', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, title, subject, class_name, created_at FROM lesson_plans
       WHERE teacher_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    ).catch(() => ({ rows: [] }));
    res.json({ plans: r.rows });
  } catch {
    res.json({ plans: [] });
  }
});

router.get('/:id(\\d+)', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM teacher_notes WHERE id=$1 AND teacher_id=$2',
      [req.params.id, req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Notes not found.' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:id(\\d+)', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM teacher_notes WHERE id=$1 AND teacher_id=$2', [req.params.id, req.user.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Export: Word (.doc) or PDF ──
const NOTE_DOC_STYLES = `
  body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.55;margin:28px;color:#0f172a;}
  h1{font-size:18pt;color:#1e293b;border-bottom:2px solid #667eea;padding-bottom:8px;}
  h2{font-size:13pt;color:#667eea;margin-top:18px;}
  h3{font-size:11.5pt;color:#334155;}
  ul,ol{margin:6px 0;padding-left:24px;}
  li{margin:3px 0;}
  .meta{color:#64748b;font-size:10pt;margin-bottom:14px;}
`;

function htmlToPdfBuffer(htmlString) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uclass-notes-'));
    const htmlPath = path.join(tempDir, 'notes.html');
    const pdfPath = path.join(tempDir, 'notes.pdf');
    fs.writeFileSync(htmlPath, htmlString, 'utf8');
    const child = spawn('wkhtmltopdf', ['--enable-local-file-access', '--encoding', 'utf-8', '--quiet', htmlPath, pdfPath]);
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); reject(new Error('PDF conversion timed out')); }, 90000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code !== 0 || !fs.existsSync(pdfPath)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return reject(new Error('PDF not produced'));
      }
      const bytes = fs.readFileSync(pdfPath);
      fs.rmSync(tempDir, { recursive: true, force: true });
      resolve(bytes);
    });
  });
}

router.post('/export', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    const html = String(req.body.html || '');
    const mode = ['doc', 'pdf'].includes(req.body.mode) ? req.body.mode : 'pdf';
    if (!html.trim() || html.length > 500000) {
      return res.status(400).json({ error: 'Notes content is missing.' });
    }
    const title = String(req.body.title || 'notes').replace(/[^\w-]+/g, '-').slice(0, 60) || 'notes';
    const meta = [req.body.subject, req.body.class_name, req.body.language].filter(Boolean).map(esc).join(' · ');
    const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${NOTE_DOC_STYLES}</style></head><body>
      <h1>${esc(req.body.title || 'Teaching Notes')}</h1>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
      ${html}
      <div class="meta" style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px;">Generated with UClass — student.umunsi.com</div>
    </body></html>`;

    if (mode === 'doc') {
      res.setHeader('Content-Type', 'application/msword');
      res.setHeader('Content-Disposition', `attachment; filename="Notes-${title}.doc"`);
      return res.send('﻿' + doc);
    }
    const pdf = await htmlToPdfBuffer(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Notes-${title}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[teacher notes export]', err.message);
    res.status(500).json({ error: 'Could not build the file right now.' });
  }
});

module.exports = router;
