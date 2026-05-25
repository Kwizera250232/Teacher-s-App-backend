const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { getConfig, requestToPay, getPaymentStatus, MIN_AMOUNT } = require('../lib/mtnMomo');

const router = express.Router();

pool.query(`
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
`).catch((e) => console.error('[donate] schema:', e.message));

router.get('/info', (_req, res) => {
  const cfg = getConfig();
  res.json({
    min_amount: MIN_AMOUNT,
    currency: 'RWF',
    mtn_configured: cfg.configured,
    mode: cfg.configured ? 'mtn_sandbox' : 'demo',
    message: 'Support UClass education — minimum 500 RWF via MTN Mobile Money (sandbox test).',
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
      referenceId = `demo-${Date.now()}-${req.user.id}`;
      status = 'DEMO_PENDING';
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
      message: cfg.configured
        ? 'Check your phone to approve the MTN MoMo payment (sandbox).'
        : 'Demo mode: MTN credentials not set on server. Payment recorded for testing.',
    });
  } catch (err) {
    console.error('[donate request]', err.message);
    res.status(502).json({ error: err.message || 'Payment request failed.' });
  }
});

router.get('/mtn/status/:referenceId', authenticateToken, async (req, res) => {
  try {
    const row = await pool.query(
      'SELECT * FROM donations WHERE reference_id=$1 AND user_id=$2',
      [req.params.referenceId, req.user.id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Donation not found.' });

    const donation = row.rows[0];
    if (donation.mode === 'demo' || donation.mode === 'mtn_sandbox' && !getConfig().configured) {
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
