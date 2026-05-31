const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

function getAppBaseUrl() {
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@umunsi.com';
  const transport = getTransporter();

  if (!transport) {
    console.warn('[mailer] SMTP not configured — email not sent:', { to, subject });
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[mailer] Dev preview:', text || html);
    }
    return { sent: false, dev: true };
  }

  await transport.sendMail({ from, to, subject, html, text });
  return { sent: true };
}

module.exports = { sendMail, getAppBaseUrl };
