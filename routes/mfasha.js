const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { insertParentNotification, sendParentInAppMessage } = require('../lib/parentHub');

const router = express.Router();
const staffOnly = [authenticateToken, requireRole('teacher', 'head_teacher')];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const LANGS = { rw: 'Kinyarwanda', en: 'English', fr: 'French', sw: 'Kiswahili' };

async function groqChat(messages, { maxTokens = 3000, temperature = 0.4, tools } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('AI is not configured (GROQ_API_KEY missing).');
  const body = { model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature };
  if (tools) body.tools = tools;
  const r = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`AI error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

function parseJson(text) {
  const s = String(text || '').replace(/```json|```/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

const langName = (code) => LANGS[code] || null;
const replyLangRule = (code) => langName(code)
  ? `Write in ${langName(code)}.`
  : 'Reply in the SAME language the teacher used (Kinyarwanda, English, French or Kiswahili). If unsure, use English.';

const pctOf = (o, t) => (t > 0 ? Math.round((o / t) * 100) : null);

// ── Access: classes this staff member may see ────────────────────────────
async function staffClasses(user) {
  const isHT = user.role === 'head_teacher' && user.school_id;
  const sql = `
    SELECT c.id, c.name, c.subject, c.grade,
      (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id)::int AS students
    FROM classes c JOIN users u ON u.id = c.teacher_id
    WHERE c.teacher_id = $1
      ${'OR c.id IN (SELECT class_id FROM class_co_teachers WHERE teacher_id = $1)'}
      ${isHT ? 'OR u.school_id = $2' : ''}
    ORDER BY c.created_at DESC LIMIT 60`;
  const params = isHT ? [user.id, user.school_id] : [user.id];
  try {
    return (await pool.query(sql, params)).rows;
  } catch {
    return (await pool.query(
      `SELECT c.id, c.name, c.subject, c.grade,
        (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id)::int AS students
       FROM classes c WHERE c.teacher_id = $1 ORDER BY c.created_at DESC LIMIT 60`, [user.id]
    )).rows;
  }
}

async function studentInClasses(studentId, classIds) {
  const r = await pool.query(
    'SELECT class_id FROM class_members WHERE student_id = $1 AND class_id = ANY($2::int[]) LIMIT 1',
    [studentId, classIds]
  );
  return r.rows[0]?.class_id || null;
}

// ── Smart alerts: watches quiz results, CAT marks, participation ─────────
async function buildAlerts(classes) {
  const ids = classes.map((c) => c.id);
  if (!ids.length) return [];
  const byId = Object.fromEntries(classes.map((c) => [c.id, c]));
  const alerts = [];

  const attempts = (await pool.query(
    `SELECT DISTINCT ON (qa.quiz_id, qa.student_id)
       qa.quiz_id, q.title, q.subject AS quiz_subject, q.class_id,
       u.id AS student_id, u.name AS student_name, qa.score, qa.total, qa.attempted_at
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     JOIN users u ON u.id = qa.student_id AND u.role = 'student'
     WHERE q.class_id = ANY($1::int[]) AND qa.total > 0
       AND qa.attempted_at > NOW() - INTERVAL '30 days'
     ORDER BY qa.quiz_id, qa.student_id, qa.attempted_at DESC`, [ids]
  )).rows;

  const quizzes = {};
  for (const a of attempts) {
    const k = a.quiz_id;
    if (!quizzes[k]) quizzes[k] = { quiz_id: k, title: a.title, subject: a.quiz_subject, class_id: a.class_id, last: a.attempted_at, rows: [] };
    quizzes[k].rows.push({ id: a.student_id, name: a.student_name, pct: pctOf(a.score, a.total) });
    if (a.attempted_at > quizzes[k].last) quizzes[k].last = a.attempted_at;
  }
  for (const q of Object.values(quizzes)) {
    const failing = q.rows.filter((r) => r.pct < 50).sort((a, b) => a.pct - b.pct);
    if (!failing.length) continue;
    const avg = Math.round(q.rows.reduce((s, r) => s + r.pct, 0) / q.rows.length);
    const cls = byId[q.class_id] || {};
    alerts.push({
      id: `quiz-${q.quiz_id}`,
      kind: 'quiz_fail',
      severity: failing.length >= 5 || avg < 50 ? 'high' : 'medium',
      class_id: q.class_id,
      class_name: cls.name,
      subject: q.subject || cls.subject || '',
      grade: cls.grade || '',
      topic: q.title,
      title: `${failing.length} student${failing.length > 1 ? 's' : ''} scored below 50% in "${q.title}"`,
      detail: `${cls.name || 'Class'} · class average ${avg}% · ${q.rows.length} took it`,
      students: failing.slice(0, 40),
      at: q.last,
    });
  }

  const cat = (await pool.query(
    `SELECT cm.class_id, cm.student_id, u.name AS student_name,
       SUM(cm.marks_obtained)::numeric AS obt, SUM(cm.total_marks)::numeric AS tot
     FROM cat_marks cm
     JOIN users u ON u.id = cm.student_id
     LEFT JOIN cat_term_sheets s ON s.id = cm.sheet_id
     WHERE cm.class_id = ANY($1::int[])
       AND (s.active = TRUE OR (cm.sheet_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM cat_term_sheets s2 WHERE s2.class_id = cm.class_id)))
     GROUP BY cm.class_id, cm.student_id, u.name
     HAVING SUM(cm.total_marks) > 0`, [ids]
  ).catch(() => ({ rows: [] }))).rows;
  const catByClass = {};
  for (const r of cat) {
    const pct = pctOf(Number(r.obt), Number(r.tot));
    if (pct < 50) (catByClass[r.class_id] ||= []).push({ id: r.student_id, name: r.student_name, pct });
  }
  for (const [classId, list] of Object.entries(catByClass)) {
    const cls = byId[classId] || {};
    list.sort((a, b) => a.pct - b.pct);
    alerts.push({
      id: `cat-${classId}`,
      kind: 'cat_low',
      severity: list.length >= 5 ? 'high' : 'medium',
      class_id: Number(classId),
      class_name: cls.name,
      subject: cls.subject || '',
      grade: cls.grade || '',
      topic: cls.subject || 'CAT revision',
      title: `${list.length} student${list.length > 1 ? 's are' : ' is'} below 50% on the active marks sheet`,
      detail: `${cls.name || 'Class'} · CAT marks (current sheet)`,
      students: list.slice(0, 40),
    });
  }

  const missed = (await pool.query(
    `SELECT q.id AS quiz_id, q.title, q.class_id,
       (SELECT COUNT(*) FROM class_members m WHERE m.class_id = q.class_id)::int AS members,
       (SELECT COUNT(DISTINCT qa.student_id) FROM quiz_attempts qa WHERE qa.quiz_id = q.id)::int AS done
     FROM quizzes q
     WHERE q.class_id = ANY($1::int[])
       AND q.created_at > NOW() - INTERVAL '14 days' AND q.created_at < NOW() - INTERVAL '1 day'`, [ids]
  ).catch(() => ({ rows: [] }))).rows;
  for (const m of missed) {
    const notDone = m.members - m.done;
    if (m.members < 3 || notDone < Math.max(3, Math.ceil(m.members * 0.3))) continue;
    const cls = byId[m.class_id] || {};
    const students = (await pool.query(
      `SELECT u.id, u.name FROM class_members cm JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND NOT EXISTS (
         SELECT 1 FROM quiz_attempts qa WHERE qa.quiz_id = $2 AND qa.student_id = cm.student_id)
       ORDER BY u.name LIMIT 40`, [m.class_id, m.quiz_id]
    )).rows;
    alerts.push({
      id: `missed-${m.quiz_id}`,
      kind: 'missed',
      severity: 'low',
      class_id: m.class_id,
      class_name: cls.name,
      subject: cls.subject || '',
      grade: cls.grade || '',
      topic: m.title,
      title: `${notDone} of ${m.members} students haven't done "${m.title}"`,
      detail: `${cls.name || 'Class'} · possible absence or no internet`,
      students,
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 25);
}

// ── Context for chat answers ─────────────────────────────────────────────
const APP_GUIDE = `UClass teacher features you can explain step by step:
- Classes: create a class, share the class code, see Students tab (behaviour points, groups, parent invite per student).
- Inside a class: Announcements, Notes, Homework, Quizzes (manual or AI Quiz Gen from text/PDF, schedule release, share with a colleague or as a public guest link), Leaderboard, Discussions, C. Status.
- Record CAT marks: one active marks sheet per class until the teacher creates a new one; old sheets stay read-only. Mid-term reports and Proclamation (.doc files in a normal folder) use the active sheet.
- Lesson Plan generator (CBC) — free with UClass signature, or pay once per term via MTN MoMo for editable .doc without signature.
- Teaching Notes generator, AI Textbooks, Colleagues' Library, Teacher Connect (calls), Coaching (live sessions), Class Now (post class photos for parents), Inyandiko (commitment, school reports), Alumni.
- Parents: invite links per student, Notify parents (in-app + chat), school announcements (head teacher).
- Chats: WhatsApp-style messaging with colleagues and parents.`;

async function buildContext(user, classes, alerts, question) {
  const lines = [];
  lines.push(`Teacher: ${user.name || 'Teacher'} (${user.role}).`);
  lines.push(`Classes (${classes.length}): ` + (classes.map((c) => `${c.name}${c.subject ? ` – ${c.subject}` : ''}${c.grade ? ` (${c.grade})` : ''}: ${c.students} students`).join('; ') || 'none yet'));
  if (alerts.length) {
    lines.push('Current alerts (REAL data):');
    for (const a of alerts.slice(0, 12)) {
      lines.push(`- ${a.title} — ${a.detail}. Students: ${a.students.slice(0, 12).map((s) => s.pct != null ? `${s.name} ${s.pct}%` : s.name).join(', ')}`);
    }
  }
  const ids = classes.map((c) => c.id);
  if (ids.length && question) {
    const roster = (await pool.query(
      `SELECT DISTINCT u.id, u.name FROM class_members cm JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = ANY($1::int[]) LIMIT 1500`, [ids]
    )).rows;
    const q = question.toLowerCase();
    const hits = roster.filter((s) => String(s.name || '').toLowerCase().split(/\s+/).some((w) => w.length > 2 && q.includes(w))).slice(0, 5);
    for (const s of hits) {
      const marks = (await pool.query(
        `SELECT q.title, qa.score, qa.total FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
         WHERE qa.student_id = $1 AND q.class_id = ANY($2::int[]) AND qa.total > 0
         ORDER BY qa.attempted_at DESC LIMIT 10`, [s.id, ids]
      )).rows;
      lines.push(`Student ${s.name}: ` + (marks.map((m) => `${m.title} ${m.score}/${m.total}`).join('; ') || 'no quiz results yet'));
    }
  }
  return lines.join('\n').slice(0, 9000);
}

const PERSONA = `You are MFASHA, the personal AI assistant of a teacher in Rwanda inside the UClass app — like Meta's Muse, but for teachers.
You are warm, practical and brief. You help with: lesson planning (Rwanda CBC), explaining topics, classroom management, marking and reports, parent communication, and how to use UClass.
Use the REAL class data given to you; never invent marks or student names. If data is missing, say so and suggest what to do in UClass.
FORMATTING RULES — strictly obey: never use markdown headings (#, ##, ###), never use horizontal rules (--- or ***), never start a line with #. Write clean, well-arranged text: short paragraphs, **bold** labels like **Name:**, and • bullet lists. Keep answers tidy and scannable. End with one helpful next step when useful.`;

// GET /api/mfasha/overview — classes + smart alerts
router.get('/overview', ...staffOnly, async (req, res) => {
  try {
    const classes = await staffClasses(req.user);
    const alerts = await buildAlerts(classes);
    res.json({ classes, alerts, ai: Boolean(process.env.GROQ_API_KEY) });
  } catch (e) {
    console.error('[mfasha/overview]', e);
    res.status(500).json({ error: 'Could not load your classes right now.' });
  }
});

// POST /api/mfasha/ask — chat with memory of recent turns
router.post('/ask', ...staffOnly, async (req, res) => {
  const question = String(req.body.question || '').slice(0, 4000).trim();
  if (!question) return res.status(400).json({ error: 'question is required.' });
  const history = (Array.isArray(req.body.history) ? req.body.history : [])
    .slice(-10)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 3000) }));
  try {
    const classes = await staffClasses(req.user);
    const alerts = await buildAlerts(classes).catch(() => []);
    const ctx = await buildContext(req.user, classes, alerts, question);
    const answer = await groqChat([
      { role: 'system', content: `${PERSONA}\n${replyLangRule(req.body.lang)}\n\n${APP_GUIDE}\n\nREAL DATA FROM THIS TEACHER'S UCLASS ACCOUNT:\n${ctx}` },
      ...history,
      { role: 'user', content: question },
    ]);
    res.json({ answer: answer || 'Sorry — I could not think of an answer. Try asking again.' });
  } catch (e) {
    console.error('[mfasha/ask]', e.message);
    res.status(502).json({ error: 'Mfasha is busy right now — try again in a moment.' });
  }
});

// POST /api/mfasha/transcribe — voice note → text (multipart field "audio")
router.post('/transcribe', ...staffOnly, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file is required.' });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI is not configured.' });
  try {
    const fd = new FormData();
    fd.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), req.file.originalname || 'voice.webm');
    fd.append('model', 'whisper-large-v3');
    fd.append('response_format', 'verbose_json');
    const r = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    res.json({ text: String(d.text || '').trim(), language: d.language || null });
  } catch (e) {
    console.error('[mfasha/transcribe]', e.message);
    res.status(502).json({ error: 'Could not understand the voice note. Try again or type your question.' });
  }
});

// POST /api/mfasha/revision-quiz — 5-question revision quiz saved to the class
router.post('/revision-quiz', ...staffOnly, async (req, res) => {
  const classId = parseInt(req.body.class_id, 10);
  const topic = String(req.body.topic || '').slice(0, 300).trim();
  if (!classId || !topic) return res.status(400).json({ error: 'class_id and topic are required.' });
  try {
    const classes = await staffClasses(req.user);
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return res.status(403).json({ error: 'You do not manage this class.' });
    const out = await groqChat([
      { role: 'system', content: `You write short revision quizzes for Rwandan ${cls.grade || ''} ${cls.subject || ''} students (CBC). ${replyLangRule(req.body.lang)} Reply with ONLY JSON: {"questions":[{"question":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"a"}]} — exactly 5 simple, clear questions that re-teach the basics. correct_answer is lowercase a, b, c or d.` },
      { role: 'user', content: `Revision quiz (about 5 minutes) on: ${topic}` },
    ], { maxTokens: 2500, temperature: 0.5 });
    const qs = (parseJson(out)?.questions || []).filter((q) => q.question && q.option_a && q.option_b).slice(0, 5);
    if (!qs.length) return res.status(422).json({ error: 'Could not write the quiz — try again.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const quiz = (await client.query(
        'INSERT INTO quizzes (class_id, title, description, grade_level, subject) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [classId, `Revision: ${topic}`.slice(0, 250), 'Quick 5-minute revision created with Mfasha.', cls.grade || null, cls.subject || null]
      )).rows[0];
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        await client.query(
          `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, order_num)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'multiple_choice',$8)`,
          [quiz.id, q.question, q.option_a, q.option_b, q.option_c || '', q.option_d || '',
            String(q.correct_answer || 'a').toLowerCase().trim().charAt(0), i]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ quiz, questions: qs, class: cls });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[mfasha/revision-quiz]', e.message);
    res.status(500).json({ error: 'Could not create the revision quiz.' });
  }
});

// POST /api/mfasha/parent-drafts — personalised parent messages, waiting for approval
router.post('/parent-drafts', ...staffOnly, async (req, res) => {
  const studentIds = (Array.isArray(req.body.student_ids) ? req.body.student_ids : []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 30);
  if (!studentIds.length) return res.status(400).json({ error: 'student_ids are required.' });
  const reason = String(req.body.reason || '').slice(0, 500);
  try {
    const classes = await staffClasses(req.user);
    const ids = classes.map((c) => c.id);
    const students = (await pool.query(
      `SELECT DISTINCT ON (u.id) u.id, u.name, c.id AS class_id, c.name AS class_name, c.subject
       FROM users u JOIN class_members cm ON cm.student_id = u.id JOIN classes c ON c.id = cm.class_id
       WHERE u.id = ANY($1::int[]) AND c.id = ANY($2::int[])`, [studentIds, ids]
    )).rows;
    if (!students.length) return res.status(403).json({ error: 'These students are not in your classes.' });
    const parents = (await pool.query(
      `SELECT pc.student_id, p.id, p.name, p.phone FROM parent_children pc JOIN users p ON p.id = pc.parent_id
       WHERE pc.student_id = ANY($1::int[])`, [students.map((s) => s.id)]
    ).catch(() => ({ rows: [] }))).rows;
    const direct = (Array.isArray(req.body.contacts) ? req.body.contacts : [])
      .map((c) => ({ student_id: parseInt(c.student_id, 10), name: String(c.name || 'Parent').slice(0, 80), phone: String(c.phone || '').replace(/\D/g, '').slice(0, 15) }))
      .filter((c) => c.phone.length >= 10 && studentIds.includes(c.student_id));
    const marks = (await pool.query(
      `SELECT qa.student_id, q.title, qa.score, qa.total FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
       WHERE qa.student_id = ANY($1::int[]) AND q.class_id = ANY($2::int[]) AND qa.total > 0
       ORDER BY qa.attempted_at DESC LIMIT 200`, [students.map((s) => s.id), ids]
    )).rows;

    const facts = students.map((s) => {
      const m = marks.filter((x) => x.student_id === s.id).slice(0, 4).map((x) => `${x.title} ${x.score}/${x.total}`).join('; ');
      return `id=${s.id} | ${s.name} | ${s.class_name}${s.subject ? ` (${s.subject})` : ''} | recent: ${m || 'no results'}`;
    }).join('\n');
    const out = await groqChat([
      { role: 'system', content: `You draft short WhatsApp messages from a Rwandan teacher (${req.user.name || 'the teacher'}) to parents. ${replyLangRule(req.body.lang || 'rw')} Warm, respectful, specific, encouraging; mention the real result and ONE simple thing the parent can do at home. Max 70 words. Greet the parent ("Muraho" in Kinyarwanda). No invented facts. Reply ONLY JSON: {"drafts":[{"student_id":1,"message":"..."}]}` },
      { role: 'user', content: `Reason: ${reason || 'the child is struggling recently'}\nStudents:\n${facts}` },
    ], { maxTokens: 3000, temperature: 0.6 });
    const map = Object.fromEntries((parseJson(out)?.drafts || []).map((d) => [Number(d.student_id), String(d.message || '')]));
    res.json({
      drafts: students.map((s) => ({
        student: { id: s.id, name: s.name, class_id: s.class_id, class_name: s.class_name },
        parents: [
          ...parents.filter((p) => p.student_id === s.id).map((p) => ({ id: p.id, name: p.name, phone: p.phone })),
          ...direct.filter((c) => c.student_id === s.id).map((c) => ({ id: null, name: c.name, phone: c.phone, whatsappOnly: true })),
        ],
        message: map[s.id] || '',
      })),
    });
  } catch (e) {
    console.error('[mfasha/parent-drafts]', e.message);
    res.status(500).json({ error: 'Could not draft parent messages.' });
  }
});

// POST /api/mfasha/send-parent — teacher approved: in-app notification + chat message
router.post('/send-parent', ...staffOnly, async (req, res) => {
  const studentId = parseInt(req.body.student_id, 10);
  const parentId = parseInt(req.body.parent_id, 10);
  const message = String(req.body.message || '').slice(0, 2000).trim();
  if (!studentId || !parentId || !message) return res.status(400).json({ error: 'student_id, parent_id and message are required.' });
  try {
    const classes = await staffClasses(req.user);
    const classId = await studentInClasses(studentId, classes.map((c) => c.id));
    if (!classId) return res.status(403).json({ error: 'This student is not in your classes.' });
    const link = await pool.query('SELECT 1 FROM parent_children WHERE parent_id = $1 AND student_id = $2', [parentId, studentId]);
    if (!link.rows.length) return res.status(403).json({ error: 'This parent is not linked to the student.' });
    await insertParentNotification({
      parentId, studentId, senderId: req.user.id, type: 'teacher_update',
      title: `Message from ${req.user.name || 'your child\'s teacher'}`,
      body: message, payload: { url: '/parent/dashboard', class_id: classId, via: 'mfasha' },
    });
    await sendParentInAppMessage({
      senderId: req.user.id, parentId, content: message, messageType: 'chat',
      contextJson: JSON.stringify({ student_id: studentId, class_id: classId, via: 'mfasha' }),
    }).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[mfasha/send-parent]', e.message);
    res.status(500).json({ error: 'Could not send the message.' });
  }
});

// GET /api/mfasha/class/:classId/parents — roster with linked parents (for one-tap messaging)
router.get('/class/:classId/parents', ...staffOnly, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  try {
    const classes = await staffClasses(req.user);
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return res.status(403).json({ error: 'You do not manage this class.' });
    const students = (await pool.query(
      `SELECT u.id, u.name,
         COALESCE((
           SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'phone', p.phone))
           FROM parent_children pc JOIN users p ON p.id = pc.parent_id
           WHERE pc.student_id = u.id), '[]') AS parents
       FROM class_members cm JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND u.role = 'student'
       ORDER BY u.name`, [classId]
    ).catch(() => ({ rows: [] }))).rows;
    res.json({ class: cls, students });
  } catch (e) {
    console.error('[mfasha/parents]', e);
    res.status(500).json({ error: 'Could not load parents.' });
  }
});

// GET /api/mfasha/stats — marks-sheet + auto-quiz statistics per class
router.get('/stats', ...staffOnly, async (req, res) => {
  try {
    const classes = await staffClasses(req.user);
    const ids = classes.map((c) => c.id);
    if (!ids.length) return res.json({ classes: [] });
    const byId = Object.fromEntries(classes.map((c) => [c.id, { ...c, quizzes: [], cat: null }]));

    // Quiz stats — latest attempt per student per quiz
    const quizRows = (await pool.query(
      `SELECT q.id, q.class_id, q.title, q.subject, q.created_at,
         COUNT(*)::int AS students,
         ROUND(AVG(t.pct))::int AS avg,
         MAX(t.pct)::int AS high,
         MIN(t.pct)::int AS low,
         (SELECT COUNT(*) FROM class_members m WHERE m.class_id = q.class_id)::int AS members
       FROM quizzes q
       JOIN (
         SELECT DISTINCT ON (qa.quiz_id, qa.student_id)
           qa.quiz_id, qa.student_id, qa.score * 100.0 / qa.total AS pct
         FROM quiz_attempts qa WHERE qa.total > 0
         ORDER BY qa.quiz_id, qa.student_id, qa.attempted_at DESC
       ) t ON t.quiz_id = q.id
       WHERE q.class_id = ANY($1::int[])
       GROUP BY q.id, q.class_id, q.title, q.subject, q.created_at
       ORDER BY q.created_at DESC`, [ids]
    ).catch(() => ({ rows: [] }))).rows;
    for (const r of quizRows) {
      byId[r.class_id]?.quizzes.push({
        id: r.id, title: r.title, subject: r.subject, date: r.created_at,
        students: r.students, members: r.members, avg: r.avg, high: r.high, low: r.low,
        pass: null, // filled below
      });
    }

    // Top/bottom students per quiz (for the drill-down)
    const leaders = (await pool.query(
      `SELECT t.quiz_id, u.name, ROUND(t.pct)::int AS pct,
         ROW_NUMBER() OVER (PARTITION BY t.quiz_id ORDER BY t.pct DESC) AS rk,
         COUNT(*) OVER (PARTITION BY t.quiz_id) AS n
       FROM (
         SELECT DISTINCT ON (qa.quiz_id, qa.student_id)
           qa.quiz_id, qa.student_id, qa.score * 100.0 / qa.total AS pct
         FROM quiz_attempts qa
         JOIN quizzes q ON q.id = qa.quiz_id AND q.class_id = ANY($1::int[])
         WHERE qa.total > 0
         ORDER BY qa.quiz_id, qa.student_id, qa.attempted_at DESC
       ) t JOIN users u ON u.id = t.student_id`, [ids]
    ).catch(() => ({ rows: [] }))).rows;
    const byQuiz = {};
    for (const r of leaders) (byQuiz[r.quiz_id] ||= []).push(r);
    for (const c of Object.values(byId)) {
      for (const q of c.quizzes) {
        const list = byQuiz[q.id] || [];
        q.top = list.filter((x) => x.rk <= 3).map((x) => ({ name: x.name, pct: x.pct }));
        q.bottom = list.filter((x) => x.rk > x.n - 3).reverse().map((x) => ({ name: x.name, pct: x.pct }));
        q.pass = Math.round((list.filter((x) => x.pct >= 50).length / Math.max(list.length, 1)) * 100);
      }
    }

    // CAT marks — active sheet stats per class
    const catRows = (await pool.query(
      `SELECT cm.class_id, s.name AS sheet,
         COUNT(DISTINCT cm.student_id)::int AS students,
         COUNT(DISTINCT cm.test_number)::int AS tests,
         ROUND(AVG(cm.marks_obtained * 100.0 / NULLIF(cm.total_marks,0)))::int AS avg,
         ROUND(MAX(tot.obt * 100.0 / NULLIF(tot.tot,0)))::int AS high,
         ROUND(MIN(tot.obt * 100.0 / NULLIF(tot.tot,0)))::int AS low
       FROM cat_marks cm
       JOIN cat_term_sheets s ON s.id = cm.sheet_id AND s.active = TRUE
       JOIN (
         SELECT class_id, student_id, SUM(marks_obtained) AS obt, SUM(total_marks) AS tot
         FROM cat_marks cm2 JOIN cat_term_sheets s2 ON s2.id = cm2.sheet_id AND s2.active = TRUE
         WHERE cm2.class_id = ANY($1::int[])
         GROUP BY cm2.class_id, cm2.student_id
       ) tot ON tot.class_id = cm.class_id AND tot.student_id = cm.student_id
       WHERE cm.class_id = ANY($1::int[])
       GROUP BY cm.class_id, s.name`, [ids]
    ).catch(() => ({ rows: [] }))).rows;
    for (const r of catRows) {
      if (byId[r.class_id]) byId[r.class_id].cat = { sheet: r.sheet, students: r.students, tests: r.tests, avg: r.avg, high: r.high, low: r.low };
    }

    res.json({ classes: Object.values(byId) });
  } catch (e) {
    console.error('[mfasha/stats]', e);
    res.status(500).json({ error: 'Could not load statistics.' });
  }
});

// POST /api/mfasha/research — web research → ready slide deck (JSON)
router.post('/research', ...staffOnly, async (req, res) => {
  const topic = String(req.body.topic || '').slice(0, 300).trim();
  if (!topic) return res.status(400).json({ error: 'topic is required.' });
  const subject = String(req.body.subject || '').slice(0, 80);
  const grade = String(req.body.grade || '').slice(0, 40);
  const messages = [
    { role: 'system', content: `You are MFASHA preparing tomorrow's lesson for a Rwandan teacher (CBC curriculum). Research the topic, prefer LOCAL Rwandan examples (places, crops, markets, Lake Kivu, Nyungwe, Kigali, Rwandan names, RWF money), simple diagrams the teacher can draw, and a quick activity. ${replyLangRule(req.body.lang)}
Reply with ONLY JSON:
{"title":"...","subtitle":"${[subject, grade].filter(Boolean).join(' · ')}","slides":[{"title":"...","bullets":["...","..."],"example":"local Rwandan example","diagram":"how to draw a simple diagram on the board (or empty)","notes":"what the teacher says"}],"activity":"5-minute class activity","sources":[{"title":"...","url":"https://..."}]}
Make 6 to 9 slides: introduction, key ideas, Rwandan examples, diagram, practice questions, summary.` },
    { role: 'user', content: `Topic: ${topic}${subject ? `\nSubject: ${subject}` : ''}${grade ? `\nClass/level: ${grade}` : ''}` },
  ];
  try {
    let out;
    try {
      out = await groqChat(messages, { maxTokens: 6000, temperature: 0.5, tools: [{ type: 'browser_search' }] });
    } catch (err) {
      console.warn('[mfasha/research] web search unavailable, using model knowledge:', err.message);
      out = await groqChat(messages, { maxTokens: 6000, temperature: 0.5 });
    }
    const deck = parseJson(out);
    if (!deck?.slides?.length) return res.status(422).json({ error: 'Could not build the slides — try a clearer topic.' });
    deck.slides = deck.slides.slice(0, 12);
    deck.sources = (deck.sources || []).filter((s) => /^https?:\/\//.test(s?.url || '')).slice(0, 8);
    res.json({ deck });
  } catch (e) {
    console.error('[mfasha/research]', e.message);
    res.status(502).json({ error: 'Research failed — try again in a moment.' });
  }
});

// POST /api/mfasha/inspire — topic → inspiring illustration + teaching guide
router.post('/inspire', ...staffOnly, async (req, res) => {
  const topic = String(req.body.topic || '').slice(0, 300).trim();
  if (!topic) return res.status(400).json({ error: 'topic is required.' });
  const subject = String(req.body.subject || '').slice(0, 80);
  const grade = String(req.body.grade || '').slice(0, 40);
  try {
    // Real struggling students from the teacher's own marks/quizzes — for the advice section
    const classes = await staffClasses(req.user);
    const ids = classes.map((c) => c.id);
    const alerts = ids.length ? await buildAlerts(classes).catch(() => []) : [];
    const struggling = [];
    for (const a of alerts) {
      for (const s of (a.students || []).slice(0, 6)) {
        if (s.pct != null && s.pct < 50) struggling.push(`${s.name} (${s.pct}% — ${a.class_name || 'class'})`);
      }
    }
    const struggleCtx = struggling.length
      ? `\nThese REAL students recently scored below 50%: ${[...new Set(struggling)].slice(0, 10).join(', ')}. In the "struggling" section give concrete advice for helping THEM in this lesson — name up to 5 of them.`
      : `\nNo recent low-mark data found — in "struggling" give general advice for weaker learners.`;

    const out = await groqChat([
      { role: 'system', content: `You are MFASHA inspiring and coaching a Rwandan teacher just before class (CBC — Competence-Based Curriculum: learner-centered, hands-on, inclusive). ${replyLangRule(req.body.lang)}
Return ONLY JSON:
{"title":"short catchy lesson title","imagePrompt":"DETAILED English image prompt: a confident, warm African teacher in smart professional teacher attire standing centered in a bright Rwandan classroom, their head in the upper-center area, holding hands-on teaching aids specific to THIS topic, a chalkboard behind with the topic title in chalk, uplifting digital illustration style","intro":"2 warm sentences about why this lesson matters to Rwandan children","aids":["CONCRETE teaching aid + exactly how to use it in THIS lesson (5-7 items; CBC hands-on; low-cost local materials: bottle tops, beans, sticks, chalk, paper, Rwanda map, real objects)"],"conduct":["how the teacher should BEHAVE and present this lesson (4-6 bullets: confident body language, questioning technique, letting learners touch/discuss aids, checking understanding, managing the class, encouragement, CBC learner-centered methods)"],"struggling":["how to treat students who score low marks in THIS topic (3-5 bullets: simple versions of tasks, pairing, praise effort, never shame, quick win first)"],"flow":["lesson flow step 1..5, short"],"encouragement":"one inspiring sentence for the teacher"}
Focus MOST on aids, conduct and struggling students — be concrete and specific to the topic, never generic.` },
      { role: 'user', content: `Topic: ${topic}${subject ? `\nSubject: ${subject}` : ''}${grade ? `\nLevel: ${grade}` : ''}${struggleCtx}` },
    ], { maxTokens: 2800, temperature: 0.7 });
    const insp = parseJson(out);
    if (!insp?.imagePrompt || !insp?.title) return res.status(422).json({ error: 'Could not create the inspiration — try again.' });
    const imgPrompt = `${String(insp.imagePrompt).slice(0, 700)}, award-winning clean digital illustration, soft warm cinematic lighting, crisp fine details, professional educational poster composition, rich warm colors, sharp focus`;
    insp.imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=1280&height=800&seed=${Math.floor(Math.random() * 99999)}&nologo=true&model=flux&enhance=true&safe=true`;
    res.json({ inspiration: insp });
  } catch (e) {
    console.error('[mfasha/inspire]', e.message);
    res.status(502).json({ error: 'Could not create the inspiration — try again in a moment.' });
  }
});

// GET /api/mfasha/image?url= — proxy generated images so canvas compositing stays untainted
router.get('/image', ...staffOnly, async (req, res) => {
  const u = String(req.query.url || '');
  if (!/^https:\/\/image\.pollinations\.ai\//.test(u)) return res.status(400).json({ error: 'bad url' });
  try {
    const r = await fetch(u);
    if (!r.ok) return res.status(502).json({ error: 'image fetch failed' });
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error('[mfasha/image]', e.message);
    res.status(502).json({ error: 'image fetch failed' });
  }
});

module.exports = router;
