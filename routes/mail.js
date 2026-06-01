const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const {
  ensureSchoolMailSchema,
  isSchoolMailEnabled,
  forwardInboundMessage,
  verifyMailgunWebhook,
  sendFromSchoolMailbox,
} = require('../lib/schoolMail');

const router = express.Router();

ensureSchoolMailSchema(pool).catch((e) => console.error('[mail] schema:', e.message));

/** Mailgun inbound (multipart/form-data). */
router.post('/inbound', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    if (!isSchoolMailEnabled()) {
      return res.status(503).json({ error: 'School mail is not enabled.' });
    }
    const sig = req.body.signature;
    if (sig && !verifyMailgunWebhook(sig.timestamp, sig.token, sig.signature)) {
      return res.status(401).json({ error: 'Invalid signature.' });
    }
    const recipient = req.body.recipient || req.body.To;
    const sender = req.body.sender || req.body.From;
    const subject = req.body.subject || req.body.Subject;
    const body = req.body['body-plain'] || req.body['stripped-text'] || '';
    const result = await forwardInboundMessage(pool, {
      recipient,
      sender,
      subject,
      body,
    });
    if (!result.forwarded) {
      console.warn('[mail/inbound]', recipient, result.reason);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[mail/inbound]', err);
    res.status(500).send('Error');
  }
});

router.get('/status', (req, res) => {
  res.json({
    enabled: isSchoolMailEnabled(),
    base_domain: process.env.SCHOOL_MAIL_BASE_DOMAIN || 'mail.umunsi.com',
    mailgun: Boolean(process.env.MAILGUN_API_KEY),
    smtp_forward: Boolean(process.env.SMTP_HOST),
  });
});

router.get('/mailbox', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT local_part, mail_domain, forward_to, forward_verified_at, created_at
       FROM school_mailboxes WHERE user_id = $1`,
      [req.user.id]
    );
    if (!r.rows.length) {
      return res.json({ has_mailbox: false, enabled: isSchoolMailEnabled() });
    }
    const m = r.rows[0];
    res.json({
      has_mailbox: true,
      email: `${m.local_part}@${m.mail_domain}`,
      forward_to: m.forward_to,
      forward_verified_at: m.forward_verified_at,
      enabled: isSchoolMailEnabled(),
    });
  } catch (err) {
    console.error('[mail/mailbox]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/send', authenticateToken, async (req, res) => {
  const { to, subject, text } = req.body || {};
  if (!to || !subject || !text) {
    return res.status(400).json({ error: 'to, subject, and text are required.' });
  }
  try {
    const result = await sendFromSchoolMailbox(pool, req.user.id, { to, subject, text });
    res.json(result);
  } catch (err) {
    console.error('[mail/send]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
