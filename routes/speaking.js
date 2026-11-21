const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const LANGS = { en: 'English', fr: 'French' };
const GROQ_MODELS = [
  process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
];
const WHISPER_MODELS = ['whisper-large-v3', 'whisper-large-v3-turbo'];
const groqKeys = () => (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '').split(',').map((s) => s.trim()).filter(Boolean);
const retryable = (msg) => /429|rate.?limit|tokens per|quota|fetch failed|network|timed? ?out|5\d\d/i.test(String(msg));

pool.query(`CREATE TABLE IF NOT EXISTS speaking_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  prompt TEXT,
  transcription TEXT,
  duration_sec NUMERIC,
  score INT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`).then(() => pool.query('CREATE INDEX IF NOT EXISTS speaking_attempts_user ON speaking_attempts(user_id, created_at DESC)'))
  .catch((e) => console.error('[speaking] table:', e.message));

async function groqChat(messages, { maxTokens = 1500, temperature = 0.5 } = {}) {
  const keys = groqKeys();
  if (!keys.length) throw new Error('AI is not configured.');
  let lastErr;
  for (const apiKey of keys) {
    for (const model of GROQ_MODELS) {
      try {
        const r = await fetch(`${GROQ_BASE}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        });
        if (!r.ok) throw new Error(`AI error ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const d = await r.json();
        return d.choices?.[0]?.message?.content || '';
      } catch (e) {
        if (!retryable(e.message)) throw e;
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('AI unavailable');
}

async function transcribe(file) {
  const keys = groqKeys();
  if (!keys.length) throw new Error('AI is not configured.');
  let lastErr;
  for (const apiKey of keys) {
    for (const model of WHISPER_MODELS) {
      try {
        const fd = new FormData();
        fd.append('file', new Blob([file.buffer], { type: file.mimetype || 'audio/webm' }), file.originalname || 'voice.webm');
        fd.append('model', model);
        fd.append('response_format', 'verbose_json');
        const r = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
        });
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
        const d = await r.json();
        return String(d.text || '').trim();
      } catch (e) {
        if (!retryable(e.message)) throw e;
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('transcription unavailable');
}

const jsonFrom = (raw) => {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
};

const READ_PASSAGE_CACHE = new Map(); // "lang:level" -> { text, topic, at }

// GET /api/speaking/passage?level=easy&lang=en — short read-aloud passage
router.get('/passage', authenticateToken, async (req, res) => {
  const level = ['easy', 'medium', 'hard'].includes(req.query.level) ? req.query.level : 'easy';
  const lang = LANGS[req.query.lang] ? req.query.lang : 'en';
  const cacheKey = `${lang}:${level}`;
  const cached = READ_PASSAGE_CACHE.get(cacheKey);
  // 4-minute cache so rapid refreshes don't burn AI quota; rotate between cached passages
  const bank = (cached?.bank || []).filter((p) => Date.now() - p.at < 4 * 60 * 1000);
  try {
    const guide = {
      easy: 'simple everyday words a 10-year-old learner can pronounce; short sentences',
      medium: 'intermediate school vocabulary; a few longer words; varied sentence length',
      hard: 'advanced academic vocabulary; longer complex sentences; some tricky words to pronounce',
    }[level];
    const raw = await groqChat([
      { role: 'system', content: `You write read-aloud practice passages for language learners in Rwanda. Reply ONLY with JSON: {"topic":"2-4 word title","text":"the passage"}.` },
      { role: 'user', content: `Write ONE ${level} read-aloud passage in ${LANGS[lang]} — exactly 45 to 60 words. Use ${guide}. Make it interesting: nature, school life, markets, football, family, science. No lists, no headings — flowing sentences only.` },
    ], { maxTokens: 300, temperature: 0.9 });
    const out = jsonFrom(raw);
    if (!out?.text) throw new Error('bad passage');
    bank.push({ text: out.text.trim(), topic: String(out.topic || 'Practice').trim(), at: Date.now() });
    READ_PASSAGE_CACHE.set(cacheKey, { bank: bank.slice(-6) });
    res.json({ topic: out.topic, text: out.text.trim(), level, lang });
  } catch (e) {
    console.error('[speaking/passage]', e.message);
    if (bank.length) {
      const p = bank[Math.floor(Math.random() * bank.length)];
      return res.json({ topic: p.topic, text: p.text, level, lang });
    }
    res.status(502).json({ error: 'Could not prepare a passage — try again.' });
  }
});

const TALK_TOPICS = {
  en: [
    'Introduce yourself and your family',
    'Describe your best friend',
    'What do you want to be when you grow up?',
    'Describe your school day',
    'Talk about your favourite food',
    'Describe your village or town',
    'Talk about a football match you watched or played',
    'What did you do last weekend?',
    'Describe the weather today',
    'Talk about your favourite subject and why',
  ],
  fr: [
    'Présente-toi et ta famille',
    'Décris ton meilleur ami',
    'Que veux-tu faire quand tu seras grand ?',
    'Décris ta journée à l’école',
    'Parle de ton plat préféré',
    'Décris ton village ou ta ville',
    'Parle d’un match de football',
    'Qu’as-tu fait le week-end dernier ?',
    'Décris le temps qu’il fait aujourd’hui',
    'Parle de ta matière préférée et pourquoi',
  ],
};

router.get('/topics', authenticateToken, (req, res) => {
  const lang = LANGS[req.query.lang] ? req.query.lang : 'en';
  res.json({ topics: TALK_TOPICS[lang] });
});

// POST /api/speaking/attempt — audio + mode + prompt + duration → scorecard
router.post('/attempt', authenticateToken, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file is required.' });
  const mode = req.body.mode === 'talk' ? 'talk' : 'read';
  const lang = LANGS[req.body.lang] ? req.body.lang : 'en';
  const prompt = String(req.body.prompt || '').slice(0, 2000).trim();
  const duration = Math.max(1, Math.min(600, parseFloat(req.body.duration_sec) || 0));
  if (!prompt) return res.status(400).json({ error: 'prompt is required.' });
  try {
    const transcription = await transcribe(req.file);
    if (!transcription) {
      return res.status(422).json({ error: 'I could not hear anything — try again closer to the microphone.', transcription: '' });
    }
    const wordsSaid = transcription.split(/\s+/).filter(Boolean).length;
    const wpm = duration > 0 ? Math.round((wordsSaid / duration) * 60) : null;

    let raw, out;
    if (mode === 'read') {
      raw = await groqChat([
        { role: 'system', content: `You are a kind ${LANGS[lang]} pronunciation coach for Rwandan school students. Compare what the student was SUPPOSED to read with what the voice transcription heard. Reply ONLY with JSON:
{"accuracy":0-100,"mispronounced":["words heard differently"],"missed":["words skipped"],"pace":"too slow"|"good"|"too fast","score":0-100,"feedback":"2 sentences, warm and encouraging","tip":"one concrete thing to practise"}
Rules: score and accuracy are 0-100 integers. Missed/mispronounced are real words from the passage, max 8 each. Judge pace for a school student (good ≈ 90–140 words per minute). Be encouraging but honest.` },
        { role: 'user', content: `PASSAGE TO READ (${LANGS[lang]}):\n"${prompt}"\n\nWHAT THE MICROPHONE HEARD:\n"${transcription}"\n\nSpeaking time: ${duration}s (${wordsSaid} words${wpm ? `, ~${wpm} wpm` : ''}).` },
      ]);
      out = jsonFrom(raw) || {};
      if (wpm !== null) out.wpm = wpm;
    } else {
      raw = await groqChat([
        { role: 'system', content: `You are a kind ${LANGS[lang]} speaking coach for Rwandan school students. Evaluate this free-talk answer. Reply ONLY with JSON:
{"grammar":0-100,"vocabulary":0-100,"fluency":0-100,"score":0-100,"mistakes":[{"said":"what they said","better":"better way"}],"feedback":"2 sentences, warm and encouraging","tip":"one concrete thing to practise"}
Rules: all scores 0-100 integers. mistakes max 4, real examples from what they said. Judge fairly for a school student level, not a native speaker.` },
        { role: 'user', content: `TOPIC: "${prompt}"\n\nWHAT THE STUDENT SAID (${LANGS[lang]}, ${duration}s):\n"${transcription}"` },
      ]);
      out = jsonFrom(raw) || {};
      if (wpm !== null) out.wpm = wpm;
    }

    const score = Math.max(0, Math.min(100, parseInt(out.score, 10) || 0));
    const details = { ...out };
    const ins = await pool.query(
      `INSERT INTO speaking_attempts (user_id, mode, lang, prompt, transcription, duration_sec, score, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
      [req.user.id, mode, lang, prompt, transcription, duration, score, JSON.stringify(details)]
    );
    res.json({ id: ins.rows[0].id, score, transcription, duration_sec: duration, ...details });
  } catch (e) {
    console.error('[speaking/attempt]', e.message);
    res.status(502).json({ error: 'Could not analyse your voice right now — try again in a moment.' });
  }
});

// GET /api/speaking/history — recent attempts
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT id, mode, lang, score, duration_sec, prompt, created_at,
              details->>'accuracy' AS accuracy, details->>'wpm' AS wpm,
              details->>'grammar' AS grammar, details->>'fluency' AS fluency
       FROM speaking_attempts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,
      [req.user.id]
    );
    const all = await pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(score),0)::int AS avg_score, COALESCE(MAX(score),0)::int AS best
       FROM speaking_attempts WHERE user_id=$1`, [req.user.id]
    );
    res.json({ attempts: rows.rows, stats: all.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
