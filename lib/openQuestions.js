// AI grading for open-ended quiz questions.
// One batched Groq call grades every open answer in a submission against the
// question, the teacher's marking guide, and length guidelines (grammar,
// punctuation, topic adherence, length). Falls back to a deterministic
// heuristic when the AI is unreachable so submissions never fail.

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_MODELS = [
  process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
];
const groqKeys = () =>
  (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const retryable = (msg) =>
  /429|rate.?limit|tokens per|quota|fetch failed|network|timed? ?out|5\d\d/i.test(String(msg));

const DEFAULT_OPEN_MARKS = 5;
const MAX_OPEN_MARKS = 30;

function openMeta(q) {
  const m = q && q.open_meta && typeof q.open_meta === 'object' ? q.open_meta : {};
  const clampInt = (v, lo, hi) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    min_words: clampInt(m.min_words, 1, 2000),
    max_words: clampInt(m.max_words, 1, 5000),
    marks: clampInt(m.marks, 1, MAX_OPEN_MARKS) || DEFAULT_OPEN_MARKS,
  };
}

// Total possible marks for a question (1 for every type except open_ended).
function questionMax(q) {
  return q.question_type === 'open_ended' ? openMeta(q).marks : 1;
}

const wordCount = (text) =>
  String(text || '').trim().split(/\s+/).filter(Boolean).length;

const jsonFrom = (raw) => {
  const cleaned = String(raw || '').replace(/```(?:json)?/g, '');
  const m = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
};

async function groqChat(messages, { maxTokens = 2000, temperature = 0.2 } = {}) {
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

// Deterministic fallback when the AI cannot be reached — mostly length-based so
// the quiz can still be submitted and scored.
function heuristicGrade(item) {
  const words = wordCount(item.answer);
  if (!words) {
    return { mark: 0, feedback: 'No answer was written.', by: 'fallback' };
  }
  const { min_words, max_words, marks } = item.meta;
  let ratio = 0.5; // a written answer never earns zero just because AI was down
  if (min_words) ratio = Math.min(1, words / min_words);
  else if (words >= 10) ratio = 0.7;
  const text = String(item.answer).trim();
  const sentenceShape = /^[A-ZÀ-Ý]/.test(text) && /[.!?]["')]*$/.test(text);
  if (sentenceShape) ratio += 0.15;
  if (max_words && words > max_words) ratio -= 0.15;
  const mark = Math.max(0, Math.min(marks, Math.round(marks * Math.min(1, ratio))));
  return {
    mark,
    feedback: 'Marked automatically — AI marking was unavailable, so this score is based mainly on answer length. Your teacher can review it.',
    by: 'fallback',
  };
}

/**
 * Grade open-ended answers.
 * items: [{ id, question, guide, meta:{min_words,max_words,marks}, answer }]
 * Returns { [id]: { mark, max, feedback, by } } — never throws.
 */
async function gradeOpenAnswers(items) {
  const out = {};
  if (!items.length) return out;

  const block = items.map((it, i) => {
    const guideBits = [];
    if (it.meta.min_words) guideBits.push(`at least ${it.meta.min_words} words`);
    if (it.meta.max_words) guideBits.push(`at most ${it.meta.max_words} words`);
    return {
      n: i + 1,
      question: it.question,
      teacher_guide: it.guide || null,
      length_guideline: guideBits.length ? guideBits.join(' and ') : null,
      max_mark: it.meta.marks,
      student_answer: String(it.answer || '').slice(0, 4000),
    };
  });

  try {
    const raw = await groqChat([
      {
        role: 'system',
        content:
          'You are a fair teacher marking open-ended student answers in a school quiz. ' +
          'For each item, judge: correctness against the question and the teacher guide (if given), ' +
          'grammar, punctuation, whether the answer stays on the topic asked, and the length guideline (if given). ' +
          'Be encouraging but honest. Award an integer mark between 0 and max_mark. ' +
          'Keep feedback short (1-2 sentences), specific and kind, addressed to the student. ' +
          'Reply with ONLY a JSON array like [{"n":1,"mark":3,"feedback":"..."}] — no markdown, no extra text.',
      },
      { role: 'user', content: JSON.stringify({ items: block }) },
    ]);
    const parsed = jsonFrom(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : []);
    for (const entry of list) {
      const idx = (parseInt(entry && entry.n, 10) || 0) - 1;
      const it = items[idx];
      if (!it || out[it.id]) continue;
      let mark = Math.round(Number(entry.mark));
      if (!Number.isFinite(mark)) continue;
      mark = Math.max(0, Math.min(it.meta.marks, mark));
      out[it.id] = {
        mark,
        max: it.meta.marks,
        feedback: String(entry.feedback || '').slice(0, 500) || 'Marked.',
        by: 'ai',
      };
    }
  } catch (e) {
    console.error('[openQuestions] AI grading failed:', e.message);
  }

  // Anything the AI did not cover gets the deterministic fallback.
  for (const it of items) {
    if (!out[it.id]) {
      const g = heuristicGrade(it);
      out[it.id] = { mark: g.mark, max: it.meta.marks, feedback: g.feedback, by: g.by };
    }
  }
  return out;
}

// Sanitise open_meta coming from the teacher's create/update payload.
function sanitizeOpenMeta(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const clampInt = (v, lo, hi) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    return Math.min(hi, Math.max(lo, n));
  };
  const meta = {};
  const minW = clampInt(m.min_words, 1, 2000);
  const maxW = clampInt(m.max_words, 1, 5000);
  const marks = clampInt(m.marks, 1, MAX_OPEN_MARKS);
  if (minW) meta.min_words = minW;
  if (maxW && (!minW || maxW >= minW)) meta.max_words = maxW;
  if (marks) meta.marks = marks;
  return meta;
}

module.exports = { gradeOpenAnswers, openMeta, questionMax, sanitizeOpenMeta, wordCount };
