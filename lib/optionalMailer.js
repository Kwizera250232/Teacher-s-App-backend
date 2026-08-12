/**
 * Multi-provider email sender.
 * Tries in order: RESEND_API_KEY → SMTP_* → not configured.
 * Returns { sent: boolean, reason?: string, provider?: string }.
 */
async function sendMail({ to, subject, text, html, replyTo }) {
  if (!to) return { sent: false, reason: 'no_recipient' };

  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'UClass <noreply@umunsi.com>';

  // --- Provider 1: Resend API (https://resend.com, 3000 free emails/month) ---
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const doFetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
      const resp = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          text,
          ...(html ? { html } : {}),
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      if (resp.ok) {
        return { sent: true, provider: 'resend' };
      }
      const errBody = await resp.text();
      console.error('[mailer:resend]', resp.status, errBody);
      return { sent: false, reason: `resend_${resp.status}: ${errBody}` };
    } catch (err) {
      console.error('[mailer:resend]', err.message);
      // Fall through to SMTP
    }
  }

  // --- Provider 2: Mailgun API (if MAILGUN_API_KEY is set) ---
  const mailgunKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN || 'mail.umunsi.com';
  if (mailgunKey) {
    try {
      const params = new URLSearchParams();
      params.append('from', from);
      params.append('to', to);
      params.append('subject', subject);
      params.append('text', text);
      if (html) params.append('html', html);
      if (replyTo) params.append('h:Reply-To', replyTo);
      const auth = Buffer.from(`api:${mailgunKey}`).toString('base64');
      const resp = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      if (resp.ok) {
        return { sent: true, provider: 'mailgun' };
      }
      const errBody = await resp.text();
      console.error('[mailer:mailgun]', resp.status, errBody.slice(0, 300));
      return { sent: false, reason: `mailgun_${resp.status}` };
    } catch (err) {
      console.error('[mailer:mailgun]', err.message);
      // Fall through to SMTP
    }
  }

  // --- Provider 3: SMTP (Gmail, etc.) ---
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
      });
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        ...(replyTo ? { replyTo } : {}),
      });
      return { sent: true, provider: 'smtp' };
    } catch (err) {
      console.error('[mailer:smtp]', err.message);
      return { sent: false, reason: err.message };
    }
  }

  // --- Not configured ---
  console.warn('[mailer] Email not sent — no RESEND_API_KEY or SMTP_* env vars configured.');
  return { sent: false, reason: 'not_configured' };
}

module.exports = { sendMail };
