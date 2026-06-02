const express = require('express');
const {
  loadSharedMoment,
  renderShareMomentHtml,
} = require('../lib/classMomentSharePage');

const router = express.Router();

/** Public HTML for WhatsApp / Facebook link previews (og:image). */
router.get('/moment/:token', async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token || token.length < 16) {
    return res.status(400).send('Invalid link.');
  }
  try {
    const moment = await loadSharedMoment(token);
    if (!moment) {
      return res.status(404).send('This link has expired or was removed.');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(renderShareMomentHtml(moment, token));
  } catch (err) {
    console.error('[share/moment]', err);
    res.status(500).send('Could not load this moment.');
  }
});

module.exports = router;
