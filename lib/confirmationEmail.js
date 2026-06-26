/**
 * Signup email confirmation for Head Teachers, Teachers and Guests.
 * Sends a designed confirmation email via the Mailtrap Email Sending API
 * (send.api.mailtrap.io). Token is stored hashed (SHA-256) — end-to-end:
 * HTTPS in transit, hashed at rest, single-use, 7-day expiry.
 *
 * Env:
 *   MAILTRAP_TOKEN  — Mailtrap API token (required to actually send)
 *   MAIL_FROM       — sender address (default hello@student.umunsi.com)
 *   FRONTEND_URL    — public site (default https://student.umunsi.com)
 *   API_PUBLIC_URL  — public API base (default https://studentapi.umunsi.com)
 */
const https = require('https');
const crypto = require('crypto');

const MAIL_FROM = process.env.MAIL_FROM || 'hello@student.umunsi.com';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'UClass — student.umunsi.com';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://student.umunsi.com').replace(/\/$/, '');
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || 'https://studentapi.umunsi.com').replace(/\/$/, '');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newConfirmToken() {
  return crypto.randomBytes(32).toString('hex');
}

function confirmUrlFor(token) {
  return `${FRONTEND_URL}/email-confirmed?token=${encodeURIComponent(token)}`;
}

/** Low-level Mailtrap send (no extra npm dependency). */
function sendViaMailtrap({ to, subject, html, text, category }) {
  return new Promise((resolve) => {
    const token = process.env.MAILTRAP_TOKEN;
    if (!token) {
      console.warn('[confirm-mail] MAILTRAP_TOKEN not set — email not sent to', to);
      return resolve({ sent: false, reason: 'not_configured' });
    }
    const body = JSON.stringify({
      from: { email: MAIL_FROM, name: MAIL_FROM_NAME },
      to: [{ email: to }],
      subject,
      html,
      text,
      category: category || 'Email Confirmation',
    });
    const req = https.request(
      {
        hostname: 'send.api.mailtrap.io',
        path: '/api/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sent: true });
          } else {
            console.error('[confirm-mail] mailtrap', res.statusCode, data.slice(0, 300));
            resolve({ sent: false, reason: `mailtrap_${res.statusCode}` });
          }
        });
      }
    );
    req.on('error', (err) => {
      console.error('[confirm-mail]', err.message);
      resolve({ sent: false, reason: err.message });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.write(body);
    req.end();
  });
}

const ROLE_LABELS = {
  head_teacher: 'Head Teacher',
  teacher: 'Teacher',
  guest: 'Guest',
};

const FEATURES = [
  ['🏫', 'Classes & class codes', 'Create or join classes in one tap with a simple class code.'],
  ['📝', 'Quizzes with auto-grading', 'Build quizzes, share them with a link, and get instant auto-graded results.'],
  ['📚', 'Notes & homework', 'Upload notes, assign homework, and collect submissions in one place.'],
  ['📸', 'Class Moments', 'Share today\u2019s class photos and moments with your class community.'],
  ['💬', 'UClass Messages', 'Chat with teachers, students and classmates — WhatsApp-style, inside UClass.'],
  ['🤖', 'Dean AI Assistant', 'An AI study companion that helps with lessons and questions.'],
  ['🏆', 'Leaderboards & achievements', 'Motivate learners with points, badges and class leaderboards.'],
  ['👨‍👩‍👧', 'Parent Hub', 'Parents follow marks, homework and school updates of their children.'],
];

function buildConfirmationEmailHtml({ name, role, confirmUrl }) {
  const roleLabel = ROLE_LABELS[role] || 'Member';
  const featureRows = FEATURES.map(
    ([icon, title, desc]) => `
      <tr>
        <td style="padding:10px 14px;vertical-align:top;width:34px;font-size:20px;">${icon}</td>
        <td style="padding:10px 14px 10px 0;">
          <strong style="color:#1e293b;font-size:14px;">${title}</strong><br/>
          <span style="color:#64748b;font-size:13px;line-height:1.5;">${desc}</span>
        </td>
      </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#eef1ff;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(79,70,229,0.12);">

        <!-- Quote banner -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 28px 24px;text-align:center;">
            <div style="font-size:34px;line-height:1;">🎓</div>
            <p style="color:#ffffff;font-size:18px;font-weight:700;margin:12px 0 6px;line-height:1.45;">
              &ldquo;Technology in Rwandan Education is possible together. Let's Support it&rdquo;
            </p>
            <p style="color:#e0e7ff;font-size:13px;margin:0;">
              — <strong>KWIZERA Jean de Dieu</strong>, UMUNSI SITE LTD CEO / Founder
            </p>
          </td>
        </tr>

        <!-- Greeting + confirm -->
        <tr>
          <td style="padding:28px 28px 8px;">
            <h1 style="color:#1e293b;font-size:21px;margin:0 0 10px;">Murakaza neza kuri UClass, ${name}! 👋</h1>
            <p style="color:#475569;font-size:14px;line-height:1.65;margin:0 0 6px;">
              Your <strong>${roleLabel}</strong> account on <a href="${FRONTEND_URL}" style="color:#4f46e5;">student.umunsi.com</a> has been created.
              You can sign in and <strong>explore everything</strong> right now — but to start using the features
              (creating classes, quizzes, homework, messages and more) please confirm your email first.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:18px 28px 8px;">
            <a href="${confirmUrl}"
               style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 44px;border-radius:999px;">
              ✅ Confirm my email
            </a>
            <p style="color:#94a3b8;font-size:12px;margin:14px 0 0;line-height:1.5;">
              This secure link works once and expires in 7 days.<br/>
              If the button doesn't work, copy this link:<br/>
              <a href="${confirmUrl}" style="color:#4f46e5;word-break:break-all;font-size:11px;">${confirmUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Features -->
        <tr>
          <td style="padding:24px 28px 6px;">
            <h2 style="color:#1e293b;font-size:16px;margin:0 0 4px;">🚀 What you'll unlock after confirming</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;margin-top:10px;">
              ${featureRows}
            </table>
          </td>
        </tr>

        <!-- Donation -->
        <tr>
          <td style="padding:22px 28px 6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
              <tr>
                <td style="padding:16px 18px;">
                  <h2 style="color:#92400e;font-size:15px;margin:0 0 6px;">💛 Support UClass — Donate</h2>
                  <p style="color:#78350f;font-size:13px;line-height:1.6;margin:0;">
                    UClass is built to keep technology in Rwandan education growing. You can support us
                    directly inside the app with <strong>MTN Mobile Money (MoMo)</strong> — from as little as
                    <strong>500 RWF</strong>. Open the <strong>Donate</strong> button in your dashboard, or call us on
                    <a href="tel:+250783450859" style="color:#92400e;font-weight:700;">0783&nbsp;450&nbsp;859</a>.
                    Every contribution helps a Rwandan classroom. Murakoze cyane! 🇷🇼
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer: OUR BRANDS -->
        <tr>
          <td style="background:#1a1a2e;padding:24px 28px;margin-top:20px;">
            <p style="color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:600;margin:0 0 12px;">Our Brands</p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:10px;">
                  <img src="${FRONTEND_URL}/images/brand/umunsi-logo.jpg" alt="Umunsi.com" width="34" height="34" style="border-radius:50%;display:block;"/>
                </td>
                <td style="padding-right:22px;">
                  <a href="https://umunsi.com" style="color:#e2e8f0;font-size:13px;text-decoration:none;font-weight:600;">Umunsi.com</a>
                </td>
                <td style="padding-right:10px;">
                  <img src="${FRONTEND_URL}/images/brand/umunsimedia-logo.jpg" alt="Umunsimedia.com" width="34" height="34" style="border-radius:50%;display:block;"/>
                </td>
                <td style="padding-right:22px;">
                  <a href="https://umunsimedia.com" style="color:#e2e8f0;font-size:13px;text-decoration:none;font-weight:600;">Umunsimedia.com</a>
                </td>
                <td style="padding-right:10px;font-size:22px;">🎓</td>
                <td><span style="color:#e2e8f0;font-size:13px;font-weight:600;">U-Class</span></td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:11px;margin:16px 0 0;line-height:1.6;">
              📞 <a href="tel:+250783450859" style="color:#94a3b8;text-decoration:none;">0783450859</a>
              &nbsp;·&nbsp; Powered by <a href="https://umunsi.com" style="color:#94a3b8;">Umunsi.com</a> — UMUNSI SITE LTD<br/>
              You received this email because this address was used to sign up on
              <a href="${FRONTEND_URL}" style="color:#94a3b8;">student.umunsi.com</a>.
              If this wasn't you, you can safely ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildConfirmationEmailText({ name, role, confirmUrl }) {
  const roleLabel = ROLE_LABELS[role] || 'Member';
  return [
    '"Technology in Rwandan Education is possible together. Let\'s Support it"',
    '— KWIZERA Jean de Dieu, UMUNSI SITE LTD CEO / Founder',
    '',
    `Murakaza neza kuri UClass, ${name}!`,
    `Your ${roleLabel} account on student.umunsi.com has been created.`,
    'You can sign in and explore everything now, but to start using the features please confirm your email:',
    '',
    confirmUrl,
    '',
    '(Secure link — works once, expires in 7 days.)',
    '',
    'After confirming you unlock: classes & class codes, quizzes with auto-grading, notes & homework,',
    'Class Moments, UClass Messages, Dean AI, leaderboards & achievements, and the Parent Hub.',
    '',
    'Support UClass: donate inside the app with MTN MoMo (from 500 RWF) or call 0783450859.',
    '',
    'OUR BRANDS: Umunsi.com | Umunsimedia.com | U-Class',
    'Powered by Umunsi.com — UMUNSI SITE LTD',
  ].join('\n');
}

async function sendConfirmationEmail({ to, name, role, token }) {
  const confirmUrl = confirmUrlFor(token);
  return sendViaMailtrap({
    to,
    subject: '✅ Confirm your UClass account — student.umunsi.com',
    html: buildConfirmationEmailHtml({ name, role, confirmUrl }),
    text: buildConfirmationEmailText({ name, role, confirmUrl }),
    category: 'Signup Confirmation',
  });
}

module.exports = {
  sendConfirmationEmail,
  newConfirmToken,
  hashToken,
  FRONTEND_URL,
};
