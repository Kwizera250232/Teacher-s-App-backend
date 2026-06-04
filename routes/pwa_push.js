const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { ensureClassMomentsSchema } = require('../lib/classMomentsSchema');
const { getVapidPublicKey, isPushEnabled } = require('../lib/pushNotify');

const router = express.Router();

router.get('/vapid-public-key', (req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.json({ enabled: false, publicKey: null });
  }
  res.json({ enabled: true, publicKey: key });
});

router.post('/push-subscribe', authenticateToken, async (req, res) => {
  if (!isPushEnabled()) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
  }

  const sub = req.body?.subscription || req.body;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;

  if (!endpoint || !p256dh || !authKey) {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }

  try {
    await ensureClassMomentsSchema();
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO UPDATE
         SET p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key`,
      [req.user.id, String(endpoint).slice(0, 2000), p256dh, authKey]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[pwa/push-subscribe]', err);
    res.status(500).json({ error: 'Could not save push subscription.' });
  }
});

router.delete('/push-subscribe', authenticateToken, async (req, res) => {
  const endpoint = req.body?.endpoint;
  try {
    await ensureClassMomentsSchema();
    if (endpoint) {
      await pool.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
        [req.user.id, String(endpoint).slice(0, 2000)]
      );
    } else {
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[pwa/push-unsubscribe]', err);
    res.status(500).json({ error: 'Could not remove push subscription.' });
  }
});

module.exports = router;
