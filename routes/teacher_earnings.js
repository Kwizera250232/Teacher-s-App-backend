const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getDisbursementConfig, transfer, getTransferStatus, normalizePhone } = require('../lib/mtnMomo');
const { ensureClassPaymentsSchema } = require('../lib/classPaymentsSchema');

const router = express.Router();

const TEACHER_SHARE_PCT = parseInt(process.env.TEACHER_SHARE_PCT || '70', 10);
const WITHDRAW_MIN = parseInt(process.env.WITHDRAW_MIN || '7000', 10);

async function earningsSummary(teacherId) {
  const collected = (await pool.query(
    `SELECT COALESCE(SUM(p.amount),0)::int AS total
     FROM class_payments p JOIN classes c ON c.id = p.class_id
     WHERE c.teacher_id=$1 AND p.status='SUCCESSFUL'`,
    [teacherId]
  )).rows[0].total;
  const share = Math.floor(collected * TEACHER_SHARE_PCT / 100);
  const withdrawn = (await pool.query(
    `SELECT COALESCE(SUM(amount),0)::int AS w FROM teacher_withdrawals
     WHERE teacher_id=$1 AND status IN ('PENDING','SUCCESSFUL')`,
    [teacherId]
  )).rows[0].w;
  return {
    total_collected: collected,
    teacher_share_pct: TEACHER_SHARE_PCT,
    teacher_share: share,
    platform_fee: collected - share,
    withdrawn,
    available: Math.max(0, share - withdrawn),
    withdraw_min: WITHDRAW_MIN,
  };
}

// ── GET /earnings — teacher earnings card data ──
router.get('/earnings', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const summary = await earningsSummary(req.user.id);
    const recent = (await pool.query(
      `SELECT p.id, p.amount, p.paid_at, u.name AS student_name, c.name AS class_name
       FROM class_payments p
       JOIN classes c ON c.id = p.class_id
       JOIN users u ON u.id = p.student_id
       WHERE c.teacher_id=$1 AND p.status='SUCCESSFUL'
       ORDER BY p.paid_at DESC LIMIT 20`,
      [req.user.id]
    )).rows;
    const withdrawals = (await pool.query(
      `SELECT id, amount, phone, status, reference_id, created_at
       FROM teacher_withdrawals WHERE teacher_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    )).rows;
    const cfg = getDisbursementConfig();
    res.json({
      ...summary,
      recent_payments: recent,
      withdrawals,
      disbursement_configured: cfg.configured,
    });
  } catch (err) {
    console.error('[earnings]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /withdraw — request disbursement to teacher's MoMo ──
router.post('/withdraw', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    await ensureClassPaymentsSchema();
    const phone = String(req.body.phone || '');
    if (!phone.trim()) return res.status(400).json({ error: 'MTN phone number is required.' });
    try { normalizePhone(phone); } catch (e) { return res.status(400).json({ error: e.message }); }

    const summary = await earningsSummary(req.user.id);
    if (summary.available < WITHDRAW_MIN) {
      return res.status(400).json({
        error: `Minimum withdrawal is ${WITHDRAW_MIN.toLocaleString()} RWF. Your available balance: ${summary.available.toLocaleString()} RWF.`,
      });
    }
    // Pending withdrawal in flight?
    const pending = (await pool.query(
      `SELECT id FROM teacher_withdrawals WHERE teacher_id=$1 AND status='PENDING'`,
      [req.user.id]
    )).rows[0];
    if (pending) return res.status(400).json({ error: 'You already have a pending withdrawal.' });

    const amount = summary.available;
    const cfg = getDisbursementConfig();
    let referenceId, status;

    if (cfg.configured) {
      const result = await transfer({
        phone, amount,
        payeeNote: 'UClass teacher earnings withdrawal',
      });
      referenceId = result.referenceId;
      status = result.status;
    } else {
      referenceId = `demo-wd-${Date.now()}`;
      status = 'PENDING'; // demo: stays pending until checked
    }

    await pool.query(
      `INSERT INTO teacher_withdrawals (teacher_id, phone, amount, reference_id, status)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, phone, amount, referenceId, status]
    );

    res.status(202).json({
      reference_id: referenceId,
      amount,
      status,
      demo: !cfg.configured,
      message: cfg.configured
        ? 'Withdrawal sent to MTN — money will arrive on your MoMo shortly.'
        : 'Demo mode: withdrawal recorded (configure MTN disbursement keys for real transfers).',
    });
  } catch (err) {
    console.error('[withdraw]', err.message);
    res.status(502).json({ error: err.message || 'Withdrawal failed.' });
  }
});

// ── GET /withdraw-status/:referenceId — poll transfer status ──
router.get('/withdraw-status/:referenceId', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  try {
    const row = (await pool.query(
      'SELECT * FROM teacher_withdrawals WHERE reference_id=$1 AND teacher_id=$2',
      [req.params.referenceId, req.user.id]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'Withdrawal not found.' });
    if (row.status === 'SUCCESSFUL' || row.status === 'FAILED' || row.status === 'REJECTED') {
      return res.json({ status: row.status, reference_id: row.reference_id });
    }
    const cfg = getDisbursementConfig();
    if (!cfg.configured || row.reference_id.startsWith('demo-')) {
      return res.json({ status: row.status, reference_id: row.reference_id });
    }
    const mtn = await getTransferStatus(row.reference_id);
    const status = mtn.status || row.status;
    if (status !== row.status) {
      await pool.query('UPDATE teacher_withdrawals SET status=$1 WHERE id=$2', [status, row.id]);
    }
    res.json({ status, reference_id: row.reference_id });
  } catch (err) {
    console.error('[withdraw status]', err.message);
    res.status(502).json({ error: err.message || 'Status check failed.' });
  }
});

module.exports = router;
