const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ugerageje inshuro nyinshi. Gerageza nyuma y\'iminota 15.' },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ugerageje inshuro nyinshi. Gerageza nyuma y\'isaha imwe.' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

// Password must be ≥8 chars, contain at least one letter and one number
function isStrongPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (pw.length < 8) return false;
  if (!/[a-zA-Z]/.test(pw)) return false;
  if (!/[0-9]/.test(pw)) return false;
  return true;
}

// ── Account lockout (in-memory, resets on restart) ─────────────────────────
// Map: email → { attempts: number, lockedUntil: Date|null }
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkLockout(email) {
  const rec = loginAttempts.get(email);
  if (!rec) return null;
  if (rec.lockedUntil && rec.lockedUntil > new Date()) {
    const remaining = Math.ceil((rec.lockedUntil - new Date()) / 60000);
    return `Konti yawe irafunzwe. Gerageza nyuma y'iminota ${remaining}.`;
  }
  return null;
}

function recordFailedLogin(email) {
  const rec = loginAttempts.get(email) || { attempts: 0, lockedUntil: null };
  rec.attempts += 1;
  if (rec.attempts >= MAX_ATTEMPTS) {
    rec.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    console.warn(`[AUDIT] Account locked: ${email} after ${rec.attempts} failed attempts`);
  }
  loginAttempts.set(email, rec);
}

function resetLoginAttempts(email) {
  loginAttempts.delete(email);
}

// ── Audit logger ──────────────────────────────────────────────────────────────
function audit(event, details) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
}

// Ensure password_reset_tokens table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE
  )
`).catch(console.error);

// Add is_approved column if it doesn't exist yet (teachers need admin approval)
pool.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT TRUE
`).catch(console.error);

// GET all schools (for dropdown)
router.get('/schools', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM schools ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('[schools GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create school
router.post('/schools', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (name.length > 200) return res.status(400).json({ error: 'School name is too long.' });
  try {
    const result = await pool.query(
      'INSERT INTO schools (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[schools POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST register
router.post('/register', authLimiter, async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();
  const { password, role, school_id } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (!['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Role must be teacher or student.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and include letters and numbers.' });
  }
  if (name.length > 150) return res.status(400).json({ error: 'Name is too long.' });
  if (phone && !/^[\d\s\+\-\(\)]{7,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    const hashed = await bcrypt.hash(password, 12);
    // Teachers require admin approval before they can log in
    const isApproved = role !== 'teacher';
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, school_id, is_approved, phone) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, email, role, school_id, is_approved',
      [name, email, hashed, role, school_id || null, isApproved, phone || null]
    );
    const user = result.rows[0];
    if (!isApproved) {
      audit('register', { email, role, status: 'pending_approval' });
      return res.status(202).json({ pending: true, message: 'Konti yawe yoherejwe. Tegereza ko umuyobozi ayemera mbere yo kwinjira.' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    audit('register', { email, role });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST login
router.post('/login', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });

  // Check lockout before DB query
  const lockMsg = checkLockout(email);
  if (lockMsg) {
    audit('login_blocked', { email });
    return res.status(429).json({ error: lockMsg });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      recordFailedLogin(email);
      audit('login_fail', { email, reason: 'user_not_found' });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      recordFailedLogin(email);
      audit('login_fail', { email, reason: 'bad_password' });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    // Check teacher approval
    if (user.role === 'teacher' && !user.is_approved) {
      audit('login_fail', { email, reason: 'pending_approval' });
      return res.status(403).json({ error: 'Konti yawe itaremezwa na umuyobozi. Tegereza imeyili y\'uburenganzira.' });
    }
    // Check suspension
    if (user.is_suspended) {
      audit('login_fail', { email, reason: 'suspended' });
      return res.status(403).json({ error: 'Konti yawe irafunzwe. Wasiliana n\'umuyobozi.' });
    }
    resetLoginAttempts(email);
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    audit('login_ok', { email, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, school_id: user.school_id } });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/forgot-password — generate a 6-digit reset code
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });

  try {
    const result = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      // Don't reveal whether the email exists
      return res.json({ message: 'If this email exists, a reset code has been generated.' });
    }
    const userId = result.rows[0].id;
    // Use crypto.randomInt for secure token generation (NOT Math.random)
    const token = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)`,
      [userId, token, expiresAt]
    );
    // In production you'd send email; here we return the token directly for in-app flow
    audit('password_reset_requested', { email });
    res.json({ message: 'Reset code generated.', token });
  } catch (err) {
    console.error('[forgot-password]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/reset-password — validate code and set new password
router.post('/reset-password', forgotLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, token, and new password are required.' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and include letters and numbers.' });
  }
  // Validate token is exactly 6 digits
  if (!/^\d{6}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid or expired reset code.' });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (userResult.rows.length === 0) return res.status(400).json({ error: 'Invalid request.' });
    const userId = userResult.rows[0].id;

    const tokenResult = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE user_id=$1 AND token=$2 AND used=FALSE AND expires_at > NOW()`,
      [userId, token]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code.' });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, userId]);
    await pool.query('UPDATE password_reset_tokens SET used=TRUE WHERE id=$1', [tokenResult.rows[0].id]);
    audit('password_reset_done', { email });
    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

