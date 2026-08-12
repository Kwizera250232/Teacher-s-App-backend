/**
 * Multi-provider email sender.
 * Tries in order: Mailtrap API → Resend API → Mailgun API → SMTP → not configured.
 * Returns { sent: boolean, reason?: string, provider?: string }.
 */
async function sendMail({ to, subject, text, html, replyTo }) {
  if (!to) return { sent: false, reason: 'no_recipient' };

  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'UClass <noreply@student.umunsi.com>';

  // --- Provider 1: Mailtrap API (bulk.api.mailtrap.io) ---
  const mailtrapToken = process.env.MAILTRAP_API_TOKEN;
  if (mailtrapToken) {
    try {
      const doFetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
      const resp = await doFetch('https://bulk.api.mailtrap.io/api/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mailtrapToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: { email: from.replace(/^.*<(.+)>.*$/, '$1'), name: 'UClass' },
          to: [{ email: to }],
          subject,
          text,
          ...(html ? { html } : {}),
          ...(replyTo ? { headers: { 'Reply-To': replyTo } } : {}),
          category: 'weekly_reports',
        }),
      });
      if (resp.ok) {
        return { sent: true, provider: 'mailtrap' };
      }
      const errBody = await resp.text();
      console.error('[mailer:mailtrap]', resp.status, errBody.slice(0, 300));
      return { sent: false, reason: `mailtrap_${resp.status}: ${errBody.slice(0, 200)}` };
    } catch (err) {
      console.error('[mailer:mailtrap]', err.message);
      // Fall through to next provider
    }
  }

  // --- Provider 2: Resend API (https://resend.com, 3000 free emails/month) ---
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

  // --- Provider 3: Mailgun API (if MAILGUN_API_KEY is set) ---
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

  // --- Provider 4: SMTP (Mailtrap, Gmail, local Postfix, etc.) ---
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host) {
    try {
      const nodemailer = require('nodemailer');
      const transportOpts = {
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
      };
      // Only add auth if user/pass are set (local Postfix doesn't need auth)
      if (user && pass) {
        transportOpts.auth = { user, pass };
      }
      const transporter = nodemailer.createTransport(transportOpts);
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
  console.warn('[mailer] Email not sent — no MAILTRAP_API_TOKEN, RESEND_API_KEY, or SMTP_* env vars configured.');
  return { sent: false, reason: 'not_configured' };
}

module.exports = { sendMail };
