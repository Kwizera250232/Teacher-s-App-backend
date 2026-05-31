const crypto = require('crypto');
const pool = require('../db');
const { sendMail, getAppBaseUrl } = require('./mailer');

const TOKEN_BYTES = 32;
const TOKEN_TTL_HOURS = 48;
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function ensureEmailVerificationSchema() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reminder_sent_at TIMESTAMP;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  const migrated = await pool.query(
    `SELECT value FROM app_meta WHERE key = 'email_verification_grandfather_v1' LIMIT 1`
  );
  if (migrated.rows.length === 0) {
    await pool.query(`UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE`);
    await pool.query(
      `INSERT INTO app_meta (key, value) VALUES ('email_verification_grandfather_v1', 'done')`
    );
    console.log('[emailVerification] Existing accounts marked as verified (one-time).');
  }
}

function buildVerificationUrl(token) {
  return `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function verificationEmailContent(name, verifyUrl) {
  const displayName = name || 'there';
  const subject = 'Confirm your email — UClass';
  const text = `Hello ${displayName},\n\nPlease confirm your email address to use class features (homework, quizzes, and more):\n\n${verifyUrl}\n\nThis link expires in ${TOKEN_TTL_HOURS} hours.\n\nIf you did not create an account, you can ignore this message.`;
  const html = `
    <p>Hello ${displayName},</p>
    <p>Please confirm your email address to use class features such as homework and quizzes.</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Confirm email</a></p>
    <p>Or copy this link:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p style="color:#64748b;font-size:13px;">This link expires in ${TOKEN_TTL_HOURS} hours.</p>
  `;
  return { subject, text, html };
}

function reminderEmailContent(name, verifyUrl) {
  const displayName = name || 'there';
  const subject = 'Reminder: confirm your email — UClass';
  const text = `Hello ${displayName},\n\nYou still need to confirm your email to access homework, quizzes, and other class tools:\n\n${verifyUrl}\n`;
  const html = `
    <p>Hello ${displayName},</p>
    <p>This is a friendly reminder to confirm your email so you can use homework, quizzes, and other class features.</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Confirm email</a></p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
  `;
  return { subject, text, html };
}

async function createVerificationToken(userId) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
  await pool.query(
    `UPDATE email_verification_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
    [userId]
  );
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );
  return token;
}

async function sendVerificationEmail(userId) {
  const { rows } = await pool.query(
    'SELECT id, name, email, email_verified FROM users WHERE id = $1',
    [userId]
  );
  if (!rows.length || rows[0].email_verified) return { skipped: true };

  const token = await createVerificationToken(userId);
  const verifyUrl = buildVerificationUrl(token);
  const { subject, text, html } = verificationEmailContent(rows[0].name, verifyUrl);

  await sendMail({ to: rows[0].email, subject, text, html });
  return { sent: true, verifyUrl: process.env.NODE_ENV !== 'production' ? verifyUrl : undefined };
}

async function maybeSendDailyReminder(userId) {
  const { rows } = await pool.query(
    `SELECT id, name, email, email_verified, verification_reminder_sent_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows.length || rows[0].email_verified) return;

  const last = rows[0].verification_reminder_sent_at
    ? new Date(rows[0].verification_reminder_sent_at).getTime()
    : 0;
  if (Date.now() - last < REMINDER_INTERVAL_MS) return;

  const token = await createVerificationToken(userId);
  const verifyUrl = buildVerificationUrl(token);
  const { subject, text, html } = reminderEmailContent(rows[0].name, verifyUrl);

  await sendMail({ to: rows[0].email, subject, text, html });
  await pool.query(
    'UPDATE users SET verification_reminder_sent_at = NOW() WHERE id = $1',
    [userId]
  );
}

async function verifyEmailToken(token) {
  const clean = String(token || '').trim();
  if (!clean) {
    const err = new Error('Verification link is invalid.');
    err.status = 400;
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT evt.*, u.email, u.name
     FROM email_verification_tokens evt
     JOIN users u ON u.id = evt.user_id
     WHERE evt.token = $1 AND evt.used = FALSE AND evt.expires_at > NOW()
     LIMIT 1`,
    [clean]
  );
  if (!rows.length) {
    const err = new Error('This confirmation link is invalid or has expired.');
    err.status = 400;
    throw err;
  }

  const row = rows[0];
  await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [row.user_id]);
  await pool.query('UPDATE email_verification_tokens SET used = TRUE WHERE id = $1', [row.id]);

  return { user_id: row.user_id, email: row.email, name: row.name };
}

function publicUserFields(userRow) {
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    school_id: userRow.school_id,
    email_verified: Boolean(userRow.email_verified),
    is_approved: userRow.is_approved !== false,
  };
}

module.exports = {
  ensureEmailVerificationSchema,
  sendVerificationEmail,
  maybeSendDailyReminder,
  verifyEmailToken,
  publicUserFields,
  buildVerificationUrl,
};
