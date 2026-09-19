const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getConfig, requestToPay, getPaymentStatus, normalizePhone } = require('../lib/mtnMomo');
const { ensureClassPaymentsSchema } = require('../lib/classPaymentsSchema');

const router = express.Router();

const CLASS_BENEFITS = [
  'Full access to all class quizzes, notes, homework & announcements',
  'Join live coaching sessions with your teacher',
  'Take part in class discussions & group work',
  'Track your marks, leaderboard & achievements',
  'Directly supports your teacher\'s work preparing lessons',
];

const MIN_CLASS_PRICE = 100;

// Friendly messages for MTN error codes (Kinyarwanda + English)
const MTN_ERRORS = {
  NOT_ENOUGH_FUNDS: 'Nta mafaranga ahagije ufitemo. Yongere wongere.',
  PAYER_NOT_FOUND: 'Iyi numero ntiyanditse kuri MTN MoMo — shyiramo numero yawe ya MTN iyobeweho. (Number not registered on MTN MoMo)',
  PAYEE_NOT_FOUND: 'Iyi numero ntiyanditse kuri MTN MoMo. (Number not registered on MTN MoMo)',
  PAYER_LIMIT_REACHED: 'Warengeje umupaka w\'ibyishyurwa kuri iyi numero — gerageza numero indi cyangwa muri saa mbere. (Payer limit reached)',
  PAYMENT_NOT_APPROVED: 'Ubwishyu ntibwemejwe kuri telefone. (Payment was not approved)',
  APPROVAL_REJECTED: 'Wabyanze ubwishyu kuri telefone yawe. (Payment rejected on phone)',
  EXPIRED: 'Ubusabe bwahisewe — igihe cyarangiye. Ongera ugerageze. (Payment request expired — try again)',
  PARTY_NOT_FOUND: 'Iyi numero ntiyanditse kuri MTN MoMo. (Number not registered)',
  INVALID_CALLBACK_URL_HOST: 'Payment configuration error — contact UClass support.',
  INVALID_CURRENCY: 'Payment configuration error — contact UClass support.',
  NOT_ALLOWED: 'Ubwishyu ntibwemewe kuri iyi numero. (Payment not allowed for this number)',
  NOT_ALLOWED_TARGET_ENVIRONMENT: 'Payment configuration error — contact UClass support.',
  RESOURCE_NOT_FOUND: 'Ubusabe ntibuboneka — ongera ugerageze. (Request not found — try again)',
  SERVICE_UNAVAILABLE: 'Serivisi ya MTN ntiboneka ubu — gerageza nyuma gato. (MTN service unavailable, try again)',
  INTERNAL_PROCESSING_ERROR: 'Habaye ikosa kuri MTN — gerageza ukundi. (MTN internal error, try again)',
};

function mtnErrorMessage(err) {
  if (err.mtnCode && MTN_ERRORS[err.mtnCode]) return MTN_ERRORS[err.mtnCode];
  return err.message || 'Payment request failed.';
}

async function teacherManagesClass(userId, classId, role) {
  if (role === 'admin' || role === 'head_teacher') return true;
  const r = await pool.query('SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2', [classId, userId]);
  return r.rows.length > 0;
}

// ── GET payment settings (any authenticated user — students see price on paywall) ──
router.get('/:classId/payment-settings', authenticateToken, async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const classId = parseInt(req.params.classId, 10);
    const r = await pool.query('SELECT * FROM class_payment_settings WHERE class_id=$1', [classId]);
    const s = r.rows[0];
    const teacher = await pool.query('SELECT u.name FROM classes c JOIN users u ON u.id=c.teacher_id WHERE c.id=$1', [classId]);
    res.json({
      enabled: Boolean(s?.enabled) && s.amount_rwf > 0,
      amount_rwf: s?.amount_rwf || 0,
      duration_days: s?.duration_days || 30,
      teacher_name: teacher.rows[0]?.name || '',
      benefits: CLASS_BENEFITS,
      is_teacher: await teacherManagesClass(req.user.id, classId, req.user.role),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT payment settings (teacher who owns the class) ──
router.put('/:classId/payment-settings', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const classId = parseInt(req.params.classId, 10);
    if (!(await teacherManagesClass(req.user.id, classId, req.user.role))) {
      return res.status(403).json({ error: 'You do not manage this class.' });
    }
    const enabled = Boolean(req.body.enabled);
    const amount = Math.max(0, Math.round(Number(req.body.amount_rwf) || 0));
    const duration = Math.min(365, Math.max(1, parseInt(req.body.duration_days, 10) || 30));
    if (enabled && amount < MIN_CLASS_PRICE) {
      return res.status(400).json({ error: `Minimum class price is ${MIN_CLASS_PRICE} RWF.` });
    }
    await pool.query(
      `INSERT INTO class_payment_settings (class_id, enabled, amount_rwf, duration_days, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (class_id) DO UPDATE SET enabled=$2, amount_rwf=$3, duration_days=$4, updated_at=NOW()`,
      [classId, enabled, amount, duration]
    );
    res.json({ enabled, amount_rwf: amount, duration_days: duration });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET my-access — student checks whether they can enter the class ──
router.get('/:classId/my-access', authenticateToken, async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const classId = parseInt(req.params.classId, 10);
    if (req.user.role !== 'student') {
      return res.json({ requires_payment: false, paid: true });
    }
    const s = (await pool.query('SELECT * FROM class_payment_settings WHERE class_id=$1', [classId])).rows[0];
    const requires = Boolean(s?.enabled) && s.amount_rwf > 0;
    if (!requires) return res.json({ requires_payment: false, paid: true });
    const sub = (await pool.query(
      `SELECT * FROM class_payments
       WHERE class_id=$1 AND student_id=$2 AND status='SUCCESSFUL' AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [classId, req.user.id]
    )).rows[0];
    res.json({
      requires_payment: true,
      paid: Boolean(sub),
      amount_rwf: s.amount_rwf,
      duration_days: s.duration_days || 30,
      expires_at: sub?.expires_at || null,
      remaining_days: sub ? Math.max(0, Math.ceil((new Date(sub.expires_at) - Date.now()) / 86400000)) : 0,
      benefits: CLASS_BENEFITS,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST pay — student initiates MTN MoMo payment ──
router.post('/:classId/pay', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const classId = parseInt(req.params.classId, 10);
    const phone = String(req.body.phone || '');
    if (!phone.trim()) return res.status(400).json({ error: 'MTN phone number is required.' });
    try { normalizePhone(phone); } catch (e) { return res.status(400).json({ error: e.message }); }

    const s = (await pool.query('SELECT * FROM class_payment_settings WHERE class_id=$1', [classId])).rows[0];
    if (!s?.enabled || !(s.amount_rwf > 0)) {
      return res.status(400).json({ error: 'This class is free — no payment needed.' });
    }

    // Already has active access?
    const active = (await pool.query(
      `SELECT id FROM class_payments WHERE class_id=$1 AND student_id=$2 AND status='SUCCESSFUL' AND expires_at > NOW() LIMIT 1`,
      [classId, req.user.id]
    )).rows[0];
    if (active) return res.json({ already_paid: true, message: 'You already have active access.' });

    const cfg = getConfig();
    const cls = (await pool.query('SELECT name FROM classes WHERE id=$1', [classId])).rows[0];
    let referenceId, status, mode;

    if (cfg.configured) {
      const result = await requestToPay({
        phone, amount: s.amount_rwf,
        payerMessage: `UClass — ${cls?.name || 'Class'} (${s.duration_days || 30} days)`,
        payeeNote: 'UClass class subscription',
      });
      referenceId = result.referenceId;
      status = result.status;
      mode = cfg.live ? 'live' : 'sandbox';
    } else {
      referenceId = `demo-${crypto.randomBytes(8).toString('hex')}`;
      status = 'SUCCESSFUL';
      mode = 'demo';
    }

    await pool.query(
      `INSERT INTO class_payments (class_id, student_id, phone, amount, reference_id, status, mode,
         paid_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $6='SUCCESSFUL' THEN NOW() ELSE NULL END,
         CASE WHEN $6='SUCCESSFUL' THEN NOW() + ($8 || ' days')::interval ELSE NULL END)`,
      [classId, req.user.id, phone, s.amount_rwf, referenceId, status, mode, s.duration_days || 30]
    );

    res.status(202).json({
      reference_id: referenceId,
      amount: s.amount_rwf,
      status,
      mode,
      demo: !cfg.configured,
      message: cfg.configured
        ? 'Check your phone and approve the MTN MoMo payment, then tap "Check status".'
        : 'Demo mode: recorded as paid (configure MTN keys for real payments).',
    });
  } catch (err) {
    console.error('[class pay]', err.message);
    res.status(502).json({ error: mtnErrorMessage(err), mtn_code: err.mtnCode || null });
  }
});

// ── GET pay-status — poll payment status; on SUCCESSFUL grant access ──
router.get('/:classId/pay-status/:referenceId', authenticateToken, async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const row = (await pool.query(
      'SELECT * FROM class_payments WHERE reference_id=$1 AND student_id=$2 AND class_id=$3',
      [req.params.referenceId, req.user.id, req.params.classId]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'Payment not found.' });

    if (row.mode === 'demo' || row.status === 'SUCCESSFUL' || row.status === 'FAILED') {
      return res.json({ status: row.status, reference_id: row.reference_id, expires_at: row.expires_at });
    }

    const cfg = getConfig();
    if (!cfg.configured) return res.json({ status: row.status, reference_id: row.reference_id });

    const mtn = await getPaymentStatus(row.reference_id);
    const status = mtn.status || row.status;
    if (status !== row.status) {
      const dur = (await pool.query('SELECT duration_days FROM class_payment_settings WHERE class_id=$1', [row.class_id])).rows[0]?.duration_days || 30;
      if (status === 'SUCCESSFUL') {
        // Extend existing access if already subscribed (stack durations)
        await pool.query(
          `UPDATE class_payments SET status=$1, paid_at=NOW(),
             expires_at = GREATEST(COALESCE(
               (SELECT MAX(expires_at) FROM class_payments
                WHERE class_id=$2 AND student_id=$3 AND status='SUCCESSFUL' AND expires_at > NOW()),
               NOW()), NOW()) + ($4 || ' days')::interval
           WHERE id=$5`,
          [status, row.class_id, row.student_id, dur, row.id]
        );
      } else {
        await pool.query('UPDATE class_payments SET status=$1 WHERE id=$2', [status, row.id]);
      }
    }
    const updated = (await pool.query('SELECT expires_at FROM class_payments WHERE id=$1', [row.id])).rows[0];
    const reasonCode = typeof mtn.reason === 'string' ? mtn.reason : (mtn.reason?.code || '');
    res.json({
      status,
      reference_id: row.reference_id,
      expires_at: updated?.expires_at,
      reason: reasonCode,
      reason_message: reasonCode && MTN_ERRORS[reasonCode] ? MTN_ERRORS[reasonCode] : undefined,
    });
  } catch (err) {
    console.error('[pay status]', err.message);
    res.status(502).json({ error: err.message || 'Status check failed.' });
  }
});

// ── GET subscribers — teacher sees who paid for the class ──
router.get('/:classId/subscribers', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const classId = parseInt(req.params.classId, 10);
    if (!(await teacherManagesClass(req.user.id, classId, req.user.role))) {
      return res.status(403).json({ error: 'You do not manage this class.' });
    }
    const rows = (await pool.query(
      `SELECT p.id, p.student_id, u.name AS student_name, p.phone, p.amount, p.status,
              p.paid_at, p.expires_at, p.created_at,
              (p.expires_at > NOW()) AS active
       FROM class_payments p JOIN users u ON u.id = p.student_id
       WHERE p.class_id=$1 ORDER BY p.created_at DESC`,
      [classId]
    )).rows;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
