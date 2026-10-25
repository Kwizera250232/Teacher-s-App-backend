const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendPushToUser } = require('../lib/pushNotify');
const { sendMail } = require('../lib/optionalMailer');

const router = express.Router();
const auth = [authenticateToken, requireRole('teacher', 'head_teacher', 'admin')];
const STAFF = ['teacher', 'head_teacher', 'admin'];
const RING_TTL_S = 150;

let schemaDone = false;
async function ensureSchema() {
  if (schemaDone) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_calls (
      id SERIAL PRIMARY KEY,
      caller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      callee_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'ringing',
      offer_sdp TEXT,
      answer_sdp TEXT,
      caller_ice JSONB NOT NULL DEFAULT '[]',
      callee_ice JSONB NOT NULL DEFAULT '[]',
      caller_read INT NOT NULL DEFAULT 0,
      callee_read INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS teacher_calls_callee_idx ON teacher_calls(callee_id, status);
    CREATE INDEX IF NOT EXISTS teacher_calls_caller_idx ON teacher_calls(caller_id, status);
  `);
  schemaDone = true;
}

const touch = () => { ensureSchema().catch((e) => console.error('[calls] schema:', e.message)); };
touch();
router.use(async (req, res, next) => { await ensureSchema().catch(() => {}); next(); });

// Expire stale rings
async function reap(c) {
  if (c.status === 'ringing' && (Date.now() - new Date(c.created_at).getTime()) / 1000 > RING_TTL_S) {
    await pool.query(`UPDATE teacher_calls SET status='missed' WHERE id=$1 AND status='ringing'`, [c.id]);
    c.status = 'missed';
  }
  return c;
}

/** POST / — start a call. Rings the callee via push notification. */
router.post('/', auth, async (req, res) => {
  try {
    const calleeId = parseInt(req.body.callee_id, 10);
    if (!calleeId || calleeId === req.user.id) return res.status(400).json({ error: 'Invalid callee.' });
    const callee = (await pool.query(`SELECT id, name, role FROM users WHERE id=$1`, [calleeId])).rows[0];
    if (!callee || !STAFF.includes(callee.role)) return res.status(404).json({ error: 'Teacher not found.' });

    // One live call per pair
    const live = await pool.query(
      `SELECT id, status FROM teacher_calls WHERE status IN ('ringing','active') AND (caller_id=$1 OR callee_id=$1)`,
      [req.user.id]
    );
    if (live.rows.length) return res.status(409).json({ error: 'A call is already in progress.', call_id: live.rows[0].id });

    const me = (await pool.query(
      `SELECT u.name, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE u.id=$1`,
      [req.user.id]
    )).rows[0];
    const callerLabel = `Teacher: ${me?.name || 'A teacher'}${me?.school_name ? ` from ${me.school_name}` : ''}`;
    const r = await pool.query(
      `INSERT INTO teacher_calls (caller_id, callee_id) VALUES ($1,$2) RETURNING *`, [req.user.id, calleeId]
    );
    const call = r.rows[0];

    // Record it in the chat thread + ring the phone
    pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3)`,
      [req.user.id, calleeId, `📞 UClass call (tap Call back in Teacher Connect to call back).`]
    ).catch(() => {});
    sendPushToUser(calleeId, {
      title: '📞 Incoming call — UClass',
      body: `${callerLabel} is calling you. Tap to answer.`,
      url: `/messages?to=${req.user.id}`,
      tag: `call-${call.id}`,
      call: true,
    }).catch(() => {});

    // Email too — "pick up a call from Teacher X"
    (async () => {
      const recv = await pool.query(
        `SELECT email, name FROM users WHERE id=$1 AND email ~* '^[^@]+@[^@]+\\.[a-z]{2,}$' AND email NOT LIKE '%@mail.umunsi.com'`,
        [calleeId]
      );
      const to = recv.rows[0]?.email;
      if (!to) return;
      const link = `${process.env.FRONTEND_URL || 'https://student.umunsi.com'}/messages?to=${req.user.id}`;
      await sendMail({
        to,
        subject: `📞 Pickup a call — ${me?.name || 'A teacher'} is calling you on UClass`,
        text: `Hi ${recv.rows[0]?.name || 'teacher'},\n\n${callerLabel} is calling you right now on UClass.\n\nOpen the app to answer: ${link}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto"><h3 style="color:#0e7490">📞 Incoming call on UClass</h3><p><strong>${callerLabel}</strong> is calling you right now.</p><a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open UClass &amp; Answer</a><p style="color:#64748b;font-size:12px;margin-top:14px">The call rings for about 2 minutes. You can also call them back from Teacher Connect.</p></div>`,
      }).catch(() => {});
    })().catch(() => {});

    res.status(201).json(call);
  } catch (err) {
    console.error('[calls] start:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET /active — calls I should see right now (incoming ring or my active outgoing). */
router.get('/active', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.*, caller.name AS caller_name, callee.name AS callee_name, caller.avatar_path AS caller_avatar
         FROM teacher_calls c
         JOIN users caller ON caller.id = c.caller_id
         JOIN users callee ON callee.id = c.callee_id
        WHERE c.status IN ('ringing','active')
          AND (c.callee_id = $1 OR c.caller_id = $1)
        ORDER BY c.created_at DESC LIMIT 3`,
      [req.user.id]
    );
    const calls = [];
    for (const c of r.rows) {
      const fresh = await reap(c);
      if (fresh.status !== 'missed') calls.push(fresh);
    }
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const myCall = async (req, res) => {
  const r = await pool.query(
    `SELECT c.*, caller.name AS caller_name, callee.name AS callee_name, caller.avatar_path AS caller_avatar
       FROM teacher_calls c
       JOIN users caller ON caller.id = c.caller_id
       JOIN users callee ON callee.id = c.callee_id
      WHERE c.id = $1 AND (c.caller_id = $2 OR c.callee_id = $2)`,
    [req.params.id, req.user.id]
  );
  const c = r.rows[0];
  if (!c) { res.status(404).json({ error: 'Call not found.' }); return null; }
  return reap(c);
};

/** GET /:id — poll call state; drains the ICE candidates meant for me. */
router.get('/:id', auth, async (req, res) => {
  try {
    const c = await myCall(req, res);
    if (!c) return;
    const isCaller = c.caller_id === req.user.id;
    const queueField = isCaller ? 'caller_ice' : 'callee_ice';
    const readField = isCaller ? 'caller_read' : 'callee_read';
    const queue = Array.isArray(c[queueField]) ? c[queueField] : [];
    const pending = queue.slice(c[readField]);
    if (pending.length) {
      await pool.query(`UPDATE teacher_calls SET ${readField}=$2 WHERE id=$1`, [c.id, queue.length]);
    }
    res.json({
      id: c.id, status: c.status, is_caller: isCaller,
      peer_name: isCaller ? c.callee_name : c.caller_name,
      peer_avatar: isCaller ? null : c.caller_avatar,
      offer: isCaller ? null : c.offer_sdp,
      answer: isCaller ? c.answer_sdp : null,
      candidates: pending,
      created_at: c.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /:id/offer — caller's SDP offer. */
router.post('/:id/offer', auth, async (req, res) => {
  try {
    const c = await myCall(req, res);
    if (!c) return;
    if (c.caller_id !== req.user.id || !req.body.sdp) return res.status(400).json({ error: 'Bad offer.' });
    await pool.query(`UPDATE teacher_calls SET offer_sdp=$2, updated_at=NOW() WHERE id=$1`, [c.id, String(req.body.sdp)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

/** POST /:id/answer — callee's SDP answer → call goes active. */
router.post('/:id/answer', auth, async (req, res) => {
  try {
    const c = await myCall(req, res);
    if (!c) return;
    if (c.callee_id !== req.user.id || !req.body.sdp) return res.status(400).json({ error: 'Bad answer.' });
    await pool.query(`UPDATE teacher_calls SET answer_sdp=$2, status='active', updated_at=NOW() WHERE id=$1`, [c.id, String(req.body.sdp)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

/** POST /:id/candidate — my ICE candidate for the other side. */
router.post('/:id/candidate', auth, async (req, res) => {
  try {
    const c = await myCall(req, res);
    if (!c) return;
    const field = c.caller_id === req.user.id ? 'callee_ice' : 'caller_ice';
    await pool.query(
      `UPDATE teacher_calls SET ${field} = ${field} || $2::jsonb WHERE id=$1`,
      [c.id, JSON.stringify([req.body.candidate])]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

/** POST /:id/hangup — either side ends (or declines). */
router.post('/:id/hangup', auth, async (req, res) => {
  try {
    const c = await myCall(req, res);
    if (!c) return;
    const status = req.body.declined && c.status === 'ringing' ? 'declined' : 'ended';
    await pool.query(`UPDATE teacher_calls SET status=$2, updated_at=NOW() WHERE id=$1`, [c.id, status]);
    res.json({ ok: true, status });
  } catch (err) { res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;
