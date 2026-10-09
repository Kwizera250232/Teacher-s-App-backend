const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getConfig, requestToPay, getPaymentStatus, normalizePhone } = require('../lib/mtnMomo');

const router = express.Router();

const LESSON_PLAN_PRICE = Math.max(100, parseInt(process.env.LESSON_PLAN_PRICE_RWF || '2000', 10));
const TERM_DAYS = Math.max(1, parseInt(process.env.LESSON_PLAN_TERM_DAYS || '120', 10));

const MTN_ERRORS = {
  NOT_ENOUGH_FUNDS: 'Nta mafaranga ahagije ufitemo. Yongere wongere.',
  PAYER_NOT_FOUND: 'Iyi numero ntiyanditse kuri MTN MoMo — shyiramo numero yawe ya MTN iyobeweho. (Number not registered on MTN MoMo)',
  PAYER_LIMIT_REACHED: 'Warengeje umupaka w\'ibyishyurwa kuri iyi numero — gerageza numero indi cyangwa muri saa mbere. (Payer limit reached)',
  PAYMENT_NOT_APPROVED: 'Ubwishyu ntibwemejwe kuri telefone. (Payment was not approved)',
  APPROVAL_REJECTED: 'Wabyanze ubwishyu kuri telefone yawe. (Payment rejected on phone)',
  EXPIRED: 'Ubusabe bwahisewe — igihe cyarangiye. Ongera ugerageze. (Payment request expired — try again)',
  NOT_ALLOWED: 'Ubwishyu ntibwemewe kuri iyi numero. (Payment not allowed for this number)',
  SERVICE_UNAVAILABLE: 'Serivisi ya MTN ntiboneka ubu — gerageza nyuma gato. (MTN service unavailable, try again)',
  INTERNAL_PROCESSING_ERROR: 'Habaye ikosa kuri MTN — gerageza ukundi. (MTN internal error, try again)',
};

function mtnErrorMessage(err) {
  if (err.mtnCode && MTN_ERRORS[err.mtnCode]) return MTN_ERRORS[err.mtnCode];
  return err.message || 'Payment request failed.';
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_plan_payments (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reference_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      mode TEXT,
      paid_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_lpp_teacher ON lesson_plan_payments(teacher_id, status, expires_at)');
}

// ── GET payment info — price + term length ──
router.get('/payment-info', authenticateToken, async (req, res) => {
  try {
    await ensureSchema();
    res.json({ amount_rwf: LESSON_PLAN_PRICE, duration_days: TERM_DAYS });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET my-access — does this teacher have a paid lesson-plan term? ──
router.get('/my-access', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureSchema();
    const sub = (await pool.query(
      `SELECT * FROM lesson_plan_payments
       WHERE teacher_id=$1 AND status='SUCCESSFUL' AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [req.user.id]
    )).rows[0];
    res.json({
      paid: Boolean(sub),
      expires_at: sub?.expires_at || null,
      amount_rwf: LESSON_PLAN_PRICE,
      duration_days: TERM_DAYS,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST pay — teacher initiates MTN MoMo payment ──
router.post('/pay', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureSchema();
    const phone = String(req.body.phone || '');
    if (!phone.trim()) return res.status(400).json({ error: 'MTN phone number is required.' });
    try { normalizePhone(phone); } catch (e) { return res.status(400).json({ error: e.message }); }

    const active = (await pool.query(
      `SELECT id FROM lesson_plan_payments WHERE teacher_id=$1 AND status='SUCCESSFUL' AND expires_at > NOW() LIMIT 1`,
      [req.user.id]
    )).rows[0];
    if (active) return res.json({ already_paid: true, message: 'You already have an active term.' });

    const cfg = getConfig();
    let referenceId, status, mode;
    if (cfg.configured) {
      const result = await requestToPay({
        phone, amount: LESSON_PLAN_PRICE,
        payerMessage: `UClass — Lesson Plan term (${TERM_DAYS} days)`,
        payeeNote: 'UClass lesson plan term',
      });
      referenceId = result.referenceId;
      status = result.status;
      mode = cfg.live ? 'live' : 'sandbox';
    } else {
      referenceId = `demo-${crypto.randomBytes(8).toString('hex')}`;
      status = 'SUCCESSFUL';
      mode = 'demo';
    }

    const paidAt = status === 'SUCCESSFUL' ? new Date() : null;
    const expiresAt = status === 'SUCCESSFUL' ? new Date(Date.now() + TERM_DAYS * 86400000) : null;
    try {
      await pool.query(
        `INSERT INTO lesson_plan_payments (teacher_id, phone, amount, reference_id, status, mode, paid_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.user.id, phone, LESSON_PLAN_PRICE, referenceId, status, mode, paidAt, expiresAt]
      );
    } catch (dbErr) {
      console.error('[lesson plan pay] insert failed after MTN accept', referenceId, dbErr.message);
    }

    res.status(202).json({
      reference_id: referenceId,
      amount: LESSON_PLAN_PRICE,
      status,
      mode,
      demo: !cfg.configured,
      message: cfg.configured
        ? 'Check your phone and approve the MTN MoMo payment.'
        : 'Demo mode: recorded as paid (configure MTN keys for real payments).',
    });
  } catch (err) {
    console.error('[lesson plan pay]', err.message);
    res.status(502).json({ error: mtnErrorMessage(err), mtn_code: err.mtnCode || null });
  }
});

// ── GET pay-status — poll payment status ──
router.get('/pay-status/:referenceId', authenticateToken, async (req, res) => {
  try {
    await ensureSchema();
    let row = (await pool.query(
      'SELECT * FROM lesson_plan_payments WHERE reference_id=$1 AND teacher_id=$2',
      [req.params.referenceId, req.user.id]
    )).rows[0];

    if (!row) {
      const cfg0 = getConfig();
      if (!cfg0.configured) return res.status(404).json({ error: 'Payment not found.' });
      try {
        const mtn0 = await getPaymentStatus(req.params.referenceId);
        if (mtn0.status === 'SUCCESSFUL') {
          const expires = new Date(Date.now() + TERM_DAYS * 86400000);
          await pool.query(
            `INSERT INTO lesson_plan_payments (teacher_id, phone, amount, reference_id, status, mode, paid_at, expires_at)
             VALUES ($1,$2,$3,$4,'SUCCESSFUL',$5,NOW(),$6)
             ON CONFLICT (reference_id) DO NOTHING`,
            [req.user.id, mtn0.payer?.partyId || '', Math.round(Number(mtn0.amount)) || LESSON_PLAN_PRICE,
             req.params.referenceId, cfg0.live ? 'live' : 'sandbox', expires]
          );
          return res.json({ status: 'SUCCESSFUL', reference_id: req.params.referenceId, expires_at: expires });
        }
        return res.json({ status: mtn0.status || 'PENDING', reference_id: req.params.referenceId });
      } catch {
        return res.status(404).json({ error: 'Payment not found.' });
      }
    }

    if (row.mode === 'demo' || row.status === 'SUCCESSFUL' || row.status === 'FAILED') {
      return res.json({ status: row.status, reference_id: row.reference_id, expires_at: row.expires_at });
    }

    const cfg = getConfig();
    if (!cfg.configured) return res.json({ status: row.status, reference_id: row.reference_id });

    const mtn = await getPaymentStatus(row.reference_id);
    const status = mtn.status || row.status;
    if (status !== row.status) {
      if (status === 'SUCCESSFUL') {
        // Extend existing term if already subscribed (stack durations)
        await pool.query(
          `UPDATE lesson_plan_payments SET status=$1, paid_at=NOW(),
             expires_at = GREATEST(COALESCE(
               (SELECT MAX(expires_at) FROM lesson_plan_payments
                WHERE teacher_id=$2 AND status='SUCCESSFUL' AND expires_at > NOW()),
               NOW()), NOW()) + make_interval(days => $3)
           WHERE id=$4`,
          [status, row.teacher_id, TERM_DAYS, row.id]
        );
      } else {
        await pool.query('UPDATE lesson_plan_payments SET status=$1 WHERE id=$2', [status, row.id]);
      }
    }
    const updated = (await pool.query('SELECT expires_at FROM lesson_plan_payments WHERE id=$1', [row.id])).rows[0];
    const reasonCode = typeof mtn.reason === 'string' ? mtn.reason : (mtn.reason?.code || '');
    res.json({
      status,
      reference_id: row.reference_id,
      expires_at: updated?.expires_at,
      reason: reasonCode,
      reason_message: reasonCode && MTN_ERRORS[reasonCode] ? MTN_ERRORS[reasonCode] : undefined,
    });
  } catch (err) {
    console.error('[lesson plan pay status]', err.message);
    res.status(502).json({ error: err.message || 'Status check failed.' });
  }
});

// ── AI generation (Groq — same provider as AI Quiz Gen) ──
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

async function callGroq(messages, maxTokens = 6000, temperature = 0.7) {
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

function extractJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function validAiSections(s) {
  if (!s || typeof s !== 'object') return false;
  for (const k of ['intro', 'dev', 'conc']) {
    const step = s[k];
    if (!step || !Array.isArray(step.teacher) || !Array.isArray(step.learner)
      || !step.teacher.length || !step.learner.length) return false;
  }
  return true;
}

// ── POST /generate — AI lesson plan content (falls back to template if AI unavailable) ──
router.post('/generate', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    const f = req.body || {};
    const prompt = [
      'You are an expert Rwandan primary school lesson planner writing CBC (Competence-Based Curriculum) lesson plans.',
      '',
      'Write the teaching/learning content for THIS exact lesson (do not write generic filler):',
      `- Subject: ${f.subject || ''}`,
      `- Class: ${f.className || ''}`,
      `- Unit title: ${f.unitTitle || ''}`,
      `- Lesson title: ${f.lessonTitle || ''}`,
      `- Lesson ${f.lessonNo || '?'} of ${f.totalLessons || '?'} in the unit`,
      `- Total duration: ${f.duration || '?'} minutes (introduction ${f.introMin || 5} min, development ${f.devMin || '?'} min, conclusion ${f.concMin || '?'} min)`,
      `- Class size: ${f.classSize || '?'} learners`,
      f.sen ? `- Special educational needs present: ${f.sen}` : '',
      f.refs ? `- References/materials: ${f.refs}` : '',
      '',
      'Rules:',
      '- Activities must be SPECIFIC to this lesson topic and subject — mention the actual topic/concept in several activities.',
      '- Include subject-appropriate methods (e.g. manipulatives for maths, reading/dialogue for languages, observation/experiment for science).',
      '- Clear, correct, simple English suitable for a Rwandan primary classroom (groups, exercise books, manila paper, board work).',
      '- Every bullet must be different — no repeated or rephrased activities between steps.',
      '- genericComp: 3-4 competences, each "Label: one sentence". crossCut: a short title; crossCutDesc: one sentence.',
      '- selfEval: 3-4 short reflection points for the teacher.',
      '',
      'Return ONLY valid JSON in exactly this shape:',
      '{"intro":{"teacher":["..."],"learner":["..."],"genericComp":"...","crossCut":"...","crossCutDesc":"..."},',
      '"dev":{"teacher":["..."],"learner":["..."],"genericComp":"...","crossCut":"...","crossCutDesc":"..."},',
      '"conc":{"teacher":["..."],"learner":["..."],"genericComp":"...","crossCut":"...","crossCutDesc":"..."},',
      '"selfEval":["..."]}',
    ].filter(Boolean).join('\n');

    const raw = await callGroq([
      { role: 'system', content: 'You produce structured CBC lesson plan content as JSON.' },
      { role: 'user', content: prompt },
    ]);
    const sections = extractJson(raw);
    if (!validAiSections(sections)) {
      return res.json({ ai: false });
    }
    res.json({ ai: true, sections });
  } catch (err) {
    console.error('[lesson plan generate]', err.message);
    res.json({ ai: false });
  }
});

// ── Export helpers ──
const LP_DOC_STYLES = `
  body{font-family:Arial,sans-serif;font-size:10pt;line-height:1.4;margin:20px;}
  table{width:100%;border-collapse:collapse;margin-bottom:5px;}
  td{border:1px solid #000;padding:5px 6px;vertical-align:top;word-break:keep-all;overflow-wrap:normal;}
  td.lp-hdr{white-space:nowrap;font-weight:bold;}
  .lp-meta,.lp-info,.lp-acts{table-layout:fixed;}
  .lp-meta td{font-size:9pt;padding:4px;}
  ul{margin:5px 0;padding-left:22px;}
  li{margin:2px 0;}
  .bold,.lp-bold{font-weight:bold;}
  .text-center,.lp-text-center{text-align:center;}
`;

const LP_BRAND_BLOCK = `
  <div style="margin-top:24px;border-top:2px solid #667eea;padding-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:9pt;color:#475569;">
    <span><strong style="color:#667eea;">UClass</strong> — AI-Powered CBC Lesson Plan Generator</span>
    <span>student.umunsi.com</span>
  </div>`;

function buildLpDoc(innerHtml, withBrand) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${LP_DOC_STYLES}</style></head><body>${innerHtml}${withBrand ? LP_BRAND_BLOCK : ''}</body></html>`;
}

// Convert an HTML string to PDF via LibreOffice headless.
function htmlToPdf(htmlString) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uclass-lp-'));
    const htmlPath = path.join(tempDir, 'plan.html');
    const pdfPath = path.join(tempDir, 'plan.pdf');
    fs.writeFileSync(htmlPath, htmlString, 'utf8');
    const child = spawn('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, htmlPath]);
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      reject(new Error('LibreOffice conversion timed out'));
    }, 90000);
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

// Stamp every page with a diagonal UClass watermark + footer signature.
async function stampBranded(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const wm = 'UCLASS  ·  student.umunsi.com';
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    for (let y = height * 0.08; y < height; y += 170) {
      for (let x = -60; x < width; x += 340) {
        page.drawText(wm, {
          x, y, size: 34, font,
          color: rgb(0.4, 0.45, 0.92),
          opacity: 0.09,
          rotate: degrees(38),
        });
      }
    }
    page.drawText('Generated with UClass AI Lesson Plan Generator — student.umunsi.com', {
      x: 40, y: 18, size: 9, font, color: rgb(0.4, 0.45, 0.92),
    });
  }
  return Buffer.from(await doc.save());
}

async function lessonPlanPaid(teacherId) {
  await ensureSchema();
  const r = await pool.query(
    `SELECT id, expires_at FROM lesson_plan_payments
     WHERE teacher_id=$1 AND status='SUCCESSFUL' AND expires_at > NOW() LIMIT 1`,
    [teacherId]
  );
  return r.rows[0] || null;
}

// ── POST /export — free: watermarked PDF · paid: clean .doc OR clean .pdf ──
router.post('/export', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    const html = String(req.body.html || '');
    const rawMode = String(req.body.mode || 'free');
    // 'paid' kept for backward compat → clean doc
    const mode = rawMode === 'paid' ? 'doc' : (['doc', 'pdf'].includes(rawMode) ? rawMode : 'free');
    if (!html.trim() || html.length > 400000) {
      return res.status(400).json({ error: 'Lesson plan content is missing.' });
    }
    const title = String(req.body.title || 'lesson-plan').replace(/[^\w-]+/g, '-').slice(0, 60) || 'lesson-plan';

    if (mode === 'doc' || mode === 'pdf') {
      const sub = await lessonPlanPaid(req.user.id);
      if (!sub) {
        return res.status(402).json({ error: 'Term payment required to download without the UClass signature.' });
      }
      if (mode === 'doc') {
        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="Lesson-Plan-${title}.doc"`);
        return res.send('﻿' + buildLpDoc(html, false));
      }
      const pdfBytes = await htmlToPdf(buildLpDoc(html, false));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Lesson-Plan-${title}.pdf"`);
      return res.send(Buffer.from(pdfBytes));
    }

    const pdfBytes = await htmlToPdf(buildLpDoc(html, true));
    const stamped = await stampBranded(pdfBytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Lesson-Plan-${title}.pdf"`);
    res.send(stamped);
  } catch (err) {
    console.error('[lesson plan export]', err.message);
    res.status(500).json({ error: 'Could not build the file right now. Try again.' });
  }
});

module.exports = router;
