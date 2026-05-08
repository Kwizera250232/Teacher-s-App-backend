const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const EXPOSE_RESET_CODE = process.env.EXPOSE_RESET_CODE === 'true';

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

function normalizeEmailDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const noProtocol = raw.replace(/^https?:\/\//, '').replace(/^mailto:/, '');
  const fromEmail = noProtocol.includes('@') ? noProtocol.split('@').pop() : noProtocol;
  const domain = fromEmail
    .split('/')[0]
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');

  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    return '';
  }
  return domain;
}

function emailDomainOf(email) {
  const val = String(email || '').trim().toLowerCase();
  if (!val.includes('@')) return '';
  return normalizeEmailDomain(val.split('@').pop());
}

function schoolEmailPolicyError(expectedDomain) {
  if (expectedDomain) {
    return `Only school email addresses ending with @${expectedDomain} are allowed. Contact School IT for your official school email.`;
  }
  return 'School email domain is not configured. Contact School IT or Head Teacher to configure your school domain.';
}

// Password must be ≥8 chars, contain at least one letter and one number
function isStrongPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (pw.length < 8) return false;
  if (!/[a-zA-Z]/.test(pw)) return false;
  if (!/[0-9]/.test(pw)) return false;
  return true;
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateSchoolCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function cleanText(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen);
}

function cleanCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
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

pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS district VARCHAR(120)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS sector VARCHAR(120)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS cell VARCHAR(120)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS village VARCHAR(120)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS student_count INTEGER NOT NULL DEFAULT 0`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS head_teacher_name VARCHAR(200)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS head_teacher_phone VARCHAR(30)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS head_teacher_email VARCHAR(255)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255)`).catch(console.error);
pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS welcome_message TEXT`).catch(console.error);

// Expand role CHECK constraint to include head_teacher
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'users_role_check'
        AND consrc LIKE '%head_teacher%'
    ) THEN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('teacher', 'student', 'admin', 'head_teacher'));
    END IF;
  END
  $$;
`).catch(console.error);

// GET all schools (for dropdown)
router.get('/schools', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, district, sector, cell, village, code FROM schools ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('[schools GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create school
router.post('/schools', async (req, res) => {
  const name = cleanText(req.body.name, 200);
  const district = cleanText(req.body.district, 120);
  const sector = cleanText(req.body.sector, 120);
  const cell = cleanText(req.body.cell, 120);
  const village = cleanText(req.body.village, 120);
  const studentCount = cleanCount(req.body.student_count);
  const headTeacherName = cleanText(req.body.head_teacher_name, 200);
  const headTeacherPhone = cleanText(req.body.head_teacher_phone, 30);
  const headTeacherEmail = cleanText(req.body.head_teacher_email, 255).toLowerCase();
  const rawEmailDomain = cleanText(req.body.email_domain, 255).toLowerCase();
  const emailDomain = normalizeEmailDomain(rawEmailDomain);

  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (name.length > 200) return res.status(400).json({ error: 'School name is too long.' });
  if (headTeacherEmail && !isValidEmail(headTeacherEmail)) {
    return res.status(400).json({ error: 'Head teacher email is invalid.' });
  }
  if (rawEmailDomain && !emailDomain) {
    return res.status(400).json({ error: 'Email domain must look like brightschool.edu.' });
  }
  try {
    const existing = await pool.query('SELECT * FROM schools WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);
    if (existing.rows.length > 0) return res.status(201).json(existing.rows[0]);

    const code = generateSchoolCode();
    const welcomeMessage = `Murakaza neza kuri ${name}. School Code yanyu ni ${code}. UClass ibifurije umwaka mwiza w'amasomo.`;
    const result = await pool.query(
      `INSERT INTO schools (name, district, sector, cell, village, student_count, head_teacher_name, head_teacher_phone, head_teacher_email, email_domain, code, welcome_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        name,
        district || null,
        sector || null,
        cell || null,
        village || null,
        studentCount,
        headTeacherName || null,
        headTeacherPhone || null,
        headTeacherEmail || null,
        emailDomain || null,
        code,
        welcomeMessage,
      ]
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
  const schoolProfile = req.body.school_profile && typeof req.body.school_profile === 'object'
    ? req.body.school_profile
    : null;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (role === 'teacher') {
    return res.status(403).json({ error: 'Teacher self-signup is disabled. Contact School IT or Head Teacher for teacher account provisioning.' });
  }
  if (!['student', 'head_teacher'].includes(role)) {
    return res.status(400).json({ error: 'Role must be student or head_teacher.' });
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

    let resolvedSchoolId = school_id || null;
    let schoolWelcomeMessage = null;
    let schoolCode = null;

    if (role === 'head_teacher') {
      if (schoolProfile) {
        const schoolName = cleanText(schoolProfile.name, 200);
        const district = cleanText(schoolProfile.district, 120);
        const sector = cleanText(schoolProfile.sector, 120);
        const cell = cleanText(schoolProfile.cell, 120);
        const village = cleanText(schoolProfile.village, 120);
        const studentCount = cleanCount(schoolProfile.student_count);
        const headTeacherName = cleanText(schoolProfile.head_teacher_name, 200);
        const headTeacherPhone = cleanText(schoolProfile.head_teacher_phone, 30);
        const headTeacherEmail = cleanText(schoolProfile.head_teacher_email, 255).toLowerCase();
        const rawEmailDomain = cleanText(schoolProfile.email_domain, 255).toLowerCase();
        const emailDomain = normalizeEmailDomain(rawEmailDomain);

        if (!schoolName || !district || !sector || !cell || !village || !headTeacherName || !headTeacherPhone || !headTeacherEmail) {
          return res.status(400).json({ error: 'Complete school profile is required for head teacher signup.' });
        }
        if (!isValidEmail(headTeacherEmail)) {
          return res.status(400).json({ error: 'School head teacher email is invalid.' });
        }
        if (rawEmailDomain && !emailDomain) {
          return res.status(400).json({ error: 'School email domain must look like brightschool.edu.' });
        }
        if (!/^[\d\s\+\-\(\)]{7,20}$/.test(headTeacherPhone)) {
          return res.status(400).json({ error: 'School head teacher phone is invalid.' });
        }

        const existingSchool = await pool.query('SELECT * FROM schools WHERE LOWER(name) = LOWER($1) LIMIT 1', [schoolName]);
        if (existingSchool.rows.length > 0) {
          const s = existingSchool.rows[0];
          const nextCode = s.code || generateSchoolCode();
          const nextWelcome = s.welcome_message || `Murakaza neza kuri ${schoolName}. School Code yanyu ni ${nextCode}. UClass ibifurije umwaka mwiza w'amasomo.`;
          const updated = await pool.query(
            `UPDATE schools
             SET district = COALESCE(NULLIF($1, ''), district),
                 sector = COALESCE(NULLIF($2, ''), sector),
                 cell = COALESCE(NULLIF($3, ''), cell),
                 village = COALESCE(NULLIF($4, ''), village),
                 student_count = CASE WHEN $5 >= 0 THEN $5 ELSE student_count END,
                 head_teacher_name = COALESCE(NULLIF($6, ''), head_teacher_name),
                 head_teacher_phone = COALESCE(NULLIF($7, ''), head_teacher_phone),
                 head_teacher_email = COALESCE(NULLIF($8, ''), head_teacher_email),
                 email_domain = COALESCE(NULLIF($9, ''), email_domain),
                 code = COALESCE(code, $10),
                 welcome_message = COALESCE(welcome_message, $11)
               WHERE id = $12
             RETURNING *`,
            [
              district,
              sector,
              cell,
              village,
              studentCount,
              headTeacherName,
              headTeacherPhone,
              headTeacherEmail,
              emailDomain,
              nextCode,
              nextWelcome,
              s.id,
            ]
          );
          resolvedSchoolId = updated.rows[0].id;
          schoolCode = updated.rows[0].code;
          schoolWelcomeMessage = updated.rows[0].welcome_message;
        } else {
          const newCode = generateSchoolCode();
          const welcomeMessage = `Murakaza neza kuri ${schoolName}. School Code yanyu ni ${newCode}. UClass ibifurije umwaka mwiza w'amasomo.`;
          const inserted = await pool.query(
            `INSERT INTO schools (name, district, sector, cell, village, student_count, head_teacher_name, head_teacher_phone, head_teacher_email, email_domain, code, welcome_message)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [
              schoolName,
              district,
              sector,
              cell,
              village,
              studentCount,
              headTeacherName,
              headTeacherPhone,
              headTeacherEmail,
              emailDomain || null,
              newCode,
              welcomeMessage,
            ]
          );
          resolvedSchoolId = inserted.rows[0].id;
          schoolCode = inserted.rows[0].code;
          schoolWelcomeMessage = inserted.rows[0].welcome_message;
        }
      }

      if (resolvedSchoolId) {
        const schoolCheck = await pool.query('SELECT id, code, welcome_message, email_domain FROM schools WHERE id=$1', [resolvedSchoolId]);
        if (schoolCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Selected school does not exist.' });
        }
        const requiredDomain = normalizeEmailDomain(schoolCheck.rows[0].email_domain);
        const userDomain = emailDomainOf(email);
        if (!requiredDomain || userDomain !== requiredDomain) {
          return res.status(403).json({ error: schoolEmailPolicyError(requiredDomain) });
        }
        schoolCode = schoolCode || schoolCheck.rows[0].code;
        schoolWelcomeMessage = schoolWelcomeMessage || schoolCheck.rows[0].welcome_message;
      } else if (role === 'head_teacher') {
        return res.status(400).json({ error: 'Head teacher signup requires a school selection or full school profile.' });
      }
    } else if (role === 'student') {
      if (!resolvedSchoolId) {
        return res.status(400).json({ error: 'Students must select an existing school.' });
      }
      const schoolCheck = await pool.query('SELECT id, email_domain FROM schools WHERE id=$1', [resolvedSchoolId]);
      if (schoolCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Selected school does not exist.' });
      }
      const requiredDomain = normalizeEmailDomain(schoolCheck.rows[0].email_domain);
      const userDomain = emailDomainOf(email);
      if (!requiredDomain || userDomain !== requiredDomain) {
        return res.status(403).json({ error: schoolEmailPolicyError(requiredDomain) });
      }
    }

    const hashed = await bcrypt.hash(password, 12);
    // Teachers require admin approval; head_teacher is auto-approved
    const isApproved = role !== 'teacher';
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, school_id, is_approved, phone) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, email, role, school_id, is_approved',
      [name, email, hashed, role, resolvedSchoolId, isApproved, phone || null]
    );
    const user = result.rows[0];
    if (!isApproved) {
      audit('register', { email, role, status: 'pending_approval' });
      return res.status(202).json({
        pending: true,
        message: 'Konti yawe yoherejwe. Tegereza ko umuyobozi ayemera mbere yo kwinjira.',
        school_code: schoolCode,
        school_welcome_message: schoolWelcomeMessage,
      });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    audit('register', { email, role });
    res.status(201).json({ token, user, school_code: schoolCode, school_welcome_message: schoolWelcomeMessage });
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
    if (['student', 'teacher', 'head_teacher'].includes(user.role)) {
      if (!user.school_id) {
        audit('login_fail', { email, reason: 'missing_school_for_role', role: user.role });
        return res.status(403).json({ error: 'Your account is missing a school assignment. Contact School IT or Head Teacher.' });
      }
      const schoolCheck = await pool.query('SELECT id, email_domain FROM schools WHERE id=$1', [user.school_id]);
      if (schoolCheck.rows.length === 0) {
        audit('login_fail', { email, reason: 'school_not_found', role: user.role });
        return res.status(403).json({ error: 'Your school record could not be found. Contact School IT or Head Teacher.' });
      }
      const requiredDomain = normalizeEmailDomain(schoolCheck.rows[0].email_domain);
      const userDomain = emailDomainOf(user.email);
      if (requiredDomain && userDomain !== requiredDomain) {
        audit('login_fail', { email, reason: 'email_domain_policy', role: user.role, requiredDomain });
        return res.status(403).json({ error: schoolEmailPolicyError(requiredDomain) });
      }
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
    const resetCode = String(crypto.randomInt(100000, 999999));
    const hashedToken = hashResetToken(resetCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)`,
      [userId, hashedToken, expiresAt]
    );

    audit('password_reset_requested', { email });
    const payload = { message: 'Reset code generated.' };
    if (EXPOSE_RESET_CODE) payload.token = resetCode;
    res.json(payload);
  } catch (err) {
    console.error('[forgot-password]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/check-email — verify account email exists for no-code reset flow
router.post('/check-email', forgotLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });

  try {
    const result = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email.' });
    }
    res.json({ exists: true });
  } catch (err) {
    console.error('[check-email]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/reset-password-direct — reset password using registered email only
router.post('/reset-password-direct', forgotLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required.' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and include letters and numbers.' });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email.' });
    }

    const userId = userResult.rows[0].id;
    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, userId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);

    audit('password_reset_direct', { email });
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[reset-password-direct]', err);
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
  const tokenHash = hashResetToken(token);

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (userResult.rows.length === 0) return res.status(400).json({ error: 'Invalid request.' });
    const userId = userResult.rows[0].id;

    const tokenResult = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE user_id=$1 AND token=$2 AND used=FALSE AND expires_at > NOW()`,
      [userId, tokenHash]
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

