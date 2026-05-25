const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { getConfig, requestToPay, getPaymentStatus, MIN_AMOUNT } = require('../lib/mtnMomo');

const router = express.Router();

const MTN_SANDBOX_STEPS = [
  { id: 1, title: 'Create API User' },
  { id: 2, title: 'Create API Key' },
  { id: 3, title: 'Collection — Token' },
  { id: 4, title: 'Collection — Request to Pay' },
  { id: 5, title: 'Collection — Payment Status' },
  { id: 6, title: 'Collection — Account Status' },
  { id: 7, title: 'Collection — Account Balance' },
  { id: 8, title: 'Disbursement — Token' },
  { id: 9, title: 'Disbursement — Transfer' },
  { id: 10, title: 'Disbursement — Balance' },
  { id: 11, title: 'Disbursement — Refund' },
  { id: 12, title: 'Disbursement — Refund Status' },
  { id: 13, title: 'Disbursement — Transfer Status' },
];

async function ensureDonationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      phone VARCHAR(20),
      amount INTEGER NOT NULL,
      currency VARCHAR(3) DEFAULT 'RWF',
      reference_id VARCHAR(64) UNIQUE NOT NULL,
      status VARCHAR(30) DEFAULT 'PENDING',
      mode VARCHAR(20) DEFAULT 'sandbox',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

router.get('/info', (_req, res) => {
  const cfg = getConfig();
  res.json({
    min_amount: MIN_AMOUNT,
    currency: 'RWF',
    mtn_configured: cfg.configured,
    mode: cfg.configured ? 'mtn_sandbox' : 'demo',
    demo: !cfg.configured,
    message: 'Support UClass education — minimum 500 RWF.',
    testing_note:
      'Demo mode (no MTN keys): auto SUCCESSFUL. With MTN keys: real sandbox Request-to-Pay. Airtel/Card are not part of MTN API — separate integrations later.',
    payment_methods: [
      { id: 'mtn_momo', name: 'MTN Mobile Money (MoMo)', active: true, min: MIN_AMOUNT },
      { id: 'airtel', name: 'Airtel Money', active: false, note: 'Coming soon' },
      { id: 'card', name: 'Bank Card', active: false, note: 'Coming soon' },
    ],
    mtn_sandbox_steps: MTN_SANDBOX_STEPS,
  });
});

router.post('/mtn/request', authenticateToken, async (req, res) => {
  const phone = req.body.phone;
  const amount = parseInt(req.body.amount, 10);
  if (!phone) return res.status(400).json({ error: 'MTN phone number is required.' });
  if (!amount || amount < MIN_AMOUNT) {
    return res.status(400).json({ error: `Minimum donation is ${MIN_AMOUNT} RWF.` });
  }

  try {
    await ensureDonationsTable();
    const cfg = getConfig();
    let referenceId;
    let status = 'PENDING';
    let mode = 'demo';

    if (cfg.configured) {
      const result = await requestToPay({
        phone,
        amount,
        payerMessage: 'UClass Donation',
      });
      referenceId = result.referenceId;
      status = result.status;
      mode = 'mtn_sandbox';
    } else {
      referenceId = `demo-${crypto.randomBytes(8).toString('hex')}-${req.user.id}`;
      status = 'SUCCESSFUL';
      mode = 'demo';
    }

    await pool.query(
      `INSERT INTO donations (user_id, phone, amount, reference_id, status, mode)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, phone, amount, referenceId, status, mode]
    );

    res.status(202).json({
      reference_id: referenceId,
      amount,
      status,
      mode,
      demo: !cfg.configured,
      message: cfg.configured
        ? 'Check your phone to approve MTN MoMo (sandbox). Then tap Check status.'
        : 'Sandbox test mode: payment recorded as SUCCESSFUL. Add MTN API keys on server for real MoMo sandbox.',
    });
  } catch (err) {
    console.error('[donate request]', err.message);
    res.status(502).json({ error: err.message || 'Payment request failed.' });
  }
});

router.get('/mtn/status/:referenceId', authenticateToken, async (req, res) => {
  try {
    await ensureDonationsTable();
    const row = await pool.query(
      'SELECT * FROM donations WHERE reference_id=$1 AND user_id=$2',
      [req.params.referenceId, req.user.id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Donation not found.' });

    const donation = row.rows[0];
    if (donation.mode === 'demo' || donation.reference_id.startsWith('demo-')) {
      return res.json({
        status: donation.status || 'SUCCESSFUL',
        reference_id: donation.reference_id,
        demo: true,
      });
    }

    const cfg = getConfig();
    if (!cfg.configured) {
      return res.json({ status: donation.status, reference_id: donation.reference_id });
    }

    const mtn = await getPaymentStatus(donation.reference_id);
    const status = mtn.status || donation.status;
    await pool.query('UPDATE donations SET status=$1 WHERE id=$2', [status, donation.id]);
    res.json({ status, reference_id: donation.reference_id, mtn });
  } catch (err) {
    console.error('[donate status]', err.message);
    res.status(502).json({ error: err.message || 'Status check failed.' });
  }
});

module.exports = router;
