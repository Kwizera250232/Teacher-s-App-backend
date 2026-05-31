/** Send email when SMTP_* env vars are set (optional; in-app flows work without it). */
async function sendMail({ to, subject, text }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass || !to) {
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error('[mailer]', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendMail };
