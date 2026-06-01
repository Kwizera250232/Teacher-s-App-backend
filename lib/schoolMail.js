/**
 * Real school mailboxes on {schoolslug}.mail.umunsi.com (or SCHOOL_MAIL_BASE_DOMAIN).
 * Inbound → forward to verified personal email. Outbound via Mailgun when configured.
 */
const crypto = require('crypto');
const { schoolDomainFromName, normalizeLocalPart, buildSchoolEmail } = require('./schoolDomain');
const { sendMail } = require('./optionalMailer');
const { isAllowedParentEmail, parseEmail } = require('./emailValidate');

const BASE_DOMAIN = () =>
  String(process.env.SCHOOL_MAIL_BASE_DOMAIN || 'mail.umunsi.com')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');

function isSchoolMailEnabled() {
  return process.env.SCHOOL_MAIL_ENABLED !== 'false';
}

function schoolMailSlug(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 48);
  return slug || 'school';
}

async function ensureSchoolMailSchema(pool) {
  await pool.query(`
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS mail_slug VARCHAR(64);
    CREATE TABLE IF NOT EXISTS school_mailboxes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
      local_part VARCHAR(64) NOT NULL,
      mail_domain VARCHAR(255) NOT NULL,
      forward_to VARCHAR(255) NOT NULL,
      forward_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_school_mailboxes_domain_local
      ON school_mailboxes (mail_domain, local_part);
    CREATE TABLE IF NOT EXISTS school_mail_forward_codes (
      id SERIAL PRIMARY KEY,
      personal_email VARCHAR(255) NOT NULL,
      code VARCHAR(8) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_school_mail_forward_codes_email
      ON school_mail_forward_codes (personal_email, used, expires_at);
    CREATE TABLE IF NOT EXISTS school_mail_forward_tokens (
      token VARCHAR(64) PRIMARY KEY,
      personal_email VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function ensureSchoolMailSlug(pool, schoolRow) {
  if (!schoolRow?.id) return null;
  let slug = schoolRow.mail_slug;
  if (!slug) {
    slug = schoolMailSlug(schoolRow.name);
    await pool.query('UPDATE schools SET mail_slug = $1 WHERE id = $2', [slug, schoolRow.id]);
    schoolRow.mail_slug = slug;
  }
  return slug;
}

/** Domain used for new mailboxes (real MX on BASE_DOMAIN). */
function mailboxDomainForSchool(schoolRow) {
  if (!isSchoolMailEnabled()) {
    return schoolRow?.email_domain || schoolDomainFromName(schoolRow?.name);
  }
  const slug = schoolRow?.mail_slug || schoolMailSlug(schoolRow?.name);
  return `${slug}.${BASE_DOMAIN()}`;
}

async function resolveMailboxDomain(pool, schoolRow) {
  if (!isSchoolMailEnabled()) {
    return ensureLegacyDomain(pool, schoolRow);
  }
  await ensureSchoolMailSlug(pool, schoolRow);
  const domain = mailboxDomainForSchool(schoolRow);
  if (schoolRow?.id && domain) {
    await pool.query(
      `UPDATE schools SET email_domain = $1 WHERE id = $2`,
      [domain, schoolRow.id]
    );
    schoolRow.email_domain = domain;
  }
  return domain;
}

async function ensureLegacyDomain(pool, schoolRow) {
  let domain = schoolRow?.email_domain;
  if (!domain && schoolRow?.name) {
    domain = schoolDomainFromName(schoolRow.name);
    if (schoolRow?.id && domain) {
      await pool.query(`UPDATE schools SET email_domain = $1 WHERE id = $2`, [domain, schoolRow.id]);
      schoolRow.email_domain = domain;
    }
  }
  return domain;
}

function buildMailboxAddress(local, schoolRow) {
  const part = normalizeLocalPart(local);
  const domain = mailboxDomainForSchool(schoolRow);
  if (!part || !domain) return null;
  return buildSchoolEmail(part, domain);
}

function normalizePersonalEmail(email) {
  const parsed = parseEmail(email);
  return parsed?.full || null;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateForwardToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function sendForwardVerificationCode(pool, personalEmail) {
  const email = normalizePersonalEmail(personalEmail);
  if (!email) return { ok: false, error: 'Invalid personal email.' };
  const allowed = isAllowedParentEmail(email);
  if (!allowed.ok) {
    return {
      ok: false,
      error: 'Use Gmail, Yahoo, Outlook, or similar for mail forwarding.',
    };
  }
  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  await pool.query(
    `INSERT INTO school_mail_forward_codes (personal_email, code, expires_at)
     VALUES ($1, $2, $3)`,
    [email, code, expires]
  );
  const mail = await sendMail({
    to: email,
    subject: 'UClass — verify your personal email',
    text:
      `Your verification code is: ${code}\n\n` +
      'Enter this when creating your school email so you can receive mail from Cursor, Google, and other sites in your personal inbox.\n\n' +
      'Code expires in 15 minutes.',
  });
  if (!mail.sent && process.env.EXPOSE_MAIL_VERIFY_CODE === 'true') {
    return { ok: true, dev_code: code, mail_sent: false };
  }
  if (!mail.sent) {
    return { ok: false, error: 'Could not send verification email. Try again later.' };
  }
  return { ok: true, mail_sent: true };
}

async function verifyForwardCode(pool, personalEmail, code) {
  const email = normalizePersonalEmail(personalEmail);
  if (!email || !code) return { ok: false, error: 'Email and code are required.' };
  const row = await pool.query(
    `SELECT id FROM school_mail_forward_codes
     WHERE personal_email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, String(code).trim()]
  );
  if (!row.rows.length) {
    return { ok: false, error: 'Invalid or expired code.' };
  }
  await pool.query('UPDATE school_mail_forward_codes SET used = TRUE WHERE id = $1', [
    row.rows[0].id,
  ]);
  const token = generateForwardToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO school_mail_forward_tokens (token, personal_email, expires_at) VALUES ($1, $2, $3)`,
    [token, email, expires]
  );
  return { ok: true, forward_token: token, forward_to: email, expires_in_seconds: 3600 };
}

async function consumeForwardToken(pool, token) {
  if (!token) return null;
  const r = await pool.query(
    `SELECT personal_email FROM school_mail_forward_tokens
     WHERE token = $1 AND expires_at > NOW()`,
    [String(token).trim()]
  );
  if (!r.rows.length) return null;
  const email = r.rows[0].personal_email;
  await pool.query('DELETE FROM school_mail_forward_tokens WHERE token = $1', [token]);
  return email;
}

async function attachMailbox(pool, { userId, schoolId, local, schoolRow, forwardTo }) {
  const email = buildMailboxAddress(local, schoolRow);
  if (!email) return null;
  const part = normalizeLocalPart(local);
  const domain = mailboxDomainForSchool(schoolRow);
  await pool.query(
    `INSERT INTO school_mailboxes (user_id, school_id, local_part, mail_domain, forward_to, forward_verified_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       forward_to = EXCLUDED.forward_to,
       forward_verified_at = EXCLUDED.forward_verified_at,
       local_part = EXCLUDED.local_part,
       mail_domain = EXCLUDED.mail_domain`,
    [userId, schoolId, part, domain, forwardTo]
  );
  return email;
}

async function findMailboxByAddress(pool, address) {
  const parsed = parseEmail(address);
  if (!parsed) return null;
  const r = await pool.query(
    `SELECT m.*, u.email AS user_email, u.name AS user_name
     FROM school_mailboxes m
     JOIN users u ON u.id = m.user_id
     WHERE m.local_part = $1 AND m.mail_domain = $2`,
    [parsed.local, parsed.domain]
  );
  return r.rows[0] || null;
}

async function forwardInboundMessage(pool, { recipient, sender, subject, body }) {
  const mailbox = await findMailboxByAddress(pool, recipient);
  if (!mailbox) {
    const user = await pool.query('SELECT id, email, name FROM users WHERE email = $1', [
      String(recipient).trim().toLowerCase(),
    ]);
    if (!user.rows.length) return { forwarded: false, reason: 'unknown_recipient' };
    return { forwarded: false, reason: 'no_mailbox', user_id: user.rows[0].id };
  }
  const text =
    `Message for your UClass school email (${mailbox.user_email})\n` +
    `From: ${sender || 'unknown'}\n` +
    `Subject: ${subject || '(no subject)'}\n\n` +
    `${body || ''}\n\n` +
    '— Forwarded by UClass mail';
  const mail = await sendMail({
    to: mailbox.forward_to,
    subject: `[School mail] ${subject || 'New message'}`,
    text,
    replyTo: sender || undefined,
  });
  return { forwarded: mail.sent, to: mailbox.forward_to, reason: mail.reason };
}

async function sendViaMailgun({ from, to, subject, text, html }) {
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN || BASE_DOMAIN();
  if (!key) return { sent: false, reason: 'mailgun_not_configured' };
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('subject', subject);
  params.append('text', text);
  if (html) params.append('html', html);
  const auth = Buffer.from(`api:${key}`).toString('base64');
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[mailgun send]', res.status, errText.slice(0, 300));
    return { sent: false, reason: 'mailgun_error' };
  }
  return { sent: true };
}

async function sendFromSchoolMailbox(pool, userId, { to, subject, text }) {
  const m = await pool.query(
    `SELECT m.*, u.name FROM school_mailboxes m JOIN users u ON u.id = m.user_id WHERE m.user_id = $1`,
    [userId]
  );
  if (!m.rows.length) {
    return sendMail({ to, subject, text });
  }
  const box = m.rows[0];
  const from = `${box.name || 'UClass user'} <${box.local_part}@${box.mail_domain}>`;
  const mg = await sendViaMailgun({ from, to, subject, text });
  if (mg.sent) return mg;
  return sendMail({
    to,
    subject,
    text: `${text}\n\n— Sent via UClass on behalf of ${box.local_part}@${box.mail_domain}`,
  });
}

function verifyMailgunWebhook(timestamp, token, signature) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return process.env.NODE_ENV !== 'production';
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(String(timestamp) + String(token));
  return hmac.digest('hex') === String(signature);
}

function mailboxCapabilities(hasMailbox, verified) {
  if (!isSchoolMailEnabled()) {
    return null;
  }
  const external = hasMailbox && verified;
  return {
    login: true,
    in_app_messaging: { send: true, receive: true },
    external_email: { send: external, receive: external },
    mailbox_domain: BASE_DOMAIN(),
    summary: external
      ? `Real school email on ${BASE_DOMAIN()}. Use it on UClass and other sites (Cursor, Google). Mail is forwarded to your verified personal inbox.`
      : `Verify a personal Gmail/Yahoo/Outlook to activate real mail forwarding.`,
  };
}

module.exports = {
  isSchoolMailEnabled,
  schoolMailSlug,
  BASE_DOMAIN,
  ensureSchoolMailSchema,
  ensureSchoolMailSlug,
  mailboxDomainForSchool,
  resolveMailboxDomain,
  buildMailboxAddress,
  sendForwardVerificationCode,
  verifyForwardCode,
  consumeForwardToken,
  attachMailbox,
  findMailboxByAddress,
  forwardInboundMessage,
  sendFromSchoolMailbox,
  sendViaMailgun,
  verifyMailgunWebhook,
  mailboxCapabilities,
};
