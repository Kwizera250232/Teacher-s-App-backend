const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { registerExpoPushToken, removeExpoPushToken } = require('../lib/expoPush');

const router = express.Router();

/** POST register Expo push token (parent / student / teacher app) */
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const token = String(req.body.token || req.body.expo_push_token || '').trim();
    if (!token) return res.status(400).json({ error: 'Push token required.' });
    const row = await registerExpoPushToken({
      userId: req.user.id,
      token,
      platform: req.body.platform || null,
    });
    res.json({ ok: true, registered: Boolean(row) });
  } catch (err) {
    console.error('[mobile_push/register]', err);
    res.status(500).json({ error: 'Could not save push token.' });
  }
});

/** DELETE unregister token (logout or disable notifications) */
router.delete('/register', authenticateToken, async (req, res) => {
  try {
    const token = String(req.body.token || req.query.token || '').trim();
    if (token) {
      await removeExpoPushToken({ userId: req.user.id, token });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[mobile_push/unregister]', err);
    res.status(500).json({ error: 'Could not remove push token.' });
  }
});

module.exports = router;
