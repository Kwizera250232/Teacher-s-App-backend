const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { schoolDomainFromName, normalizeLocalPart, buildSchoolEmail } = require('../lib/schoolDomain');
const { validateEmailForSignup } = require('../lib/emailValidate');
require('dotenv').config();

const STRICT_EMAIL = process.env.STRICT_EMAIL_VALIDATE === 'true';

function userPayload(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    school_id: row.school_id,
    is_approved: row.is_approved !== false,
  };
}

async function ensureSchoolEmailDomain(pool, schoolRow) {
  let domain = schoolRow.email_domain;
  if (!domain) {
    domain = schoolDomainFromName(schoolRow.name);
    if (domain) {
      await pool.query(
        `UPDATE schools SET email_domain = $1 WHERE id = $2`,
        [domain, schoolRow.id]
      );
      schoolRow.email_domain = domain;
    }
  }
  return domain;
}

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

function randomSchoolCode() {
  return crypto.randomBytes(4).toString('hex').slice(0, 8).toUpperCase();
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

// Add head teacher role support at the DB constraint level
pool.query(`
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('teacher', 'student', 'admin', 'head_teacher', 'parent'));
`).catch(console.error);

// Add school metadata columns if missing for head teacher / school code flows
pool.query(`
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255);
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS welcome_message TEXT;
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

// GET /validate-school-code?code=XXX — validate a school code before signup
router.get('/validate-school-code', async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'School code is required.' });
  try {
    const result = await pool.query(
      'SELECT id, name, code, email_domain, welcome_message FROM schools WHERE code = $1 LIMIT 1',
      [code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid school code. Please check and try again.' });
    }
    const school = result.rows[0];
    const emailDomain = await ensureSchoolEmailDomain(pool, school);
    const htCheck = await pool.query(
      "SELECT 1 FROM users WHERE school_id=$1 AND role='head_teacher' AND is_approved=TRUE LIMIT 1",
      [school.id]
    );
    res.json({
      valid: true,
      school: {
        id: school.id,
        name: school.name,
        code: school.code,
        email_domain: emailDomain || null,
        welcome_message: school.welcome_message || null,
        has_head_teacher: htCheck.rows.length > 0,
      },
    });
  } catch (err) {
    console.error('[validate-school-code]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET invite link preview (public)
router.get('/invite-preview', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Invitation token is required.' });
  try {
    const result = await pool.query(
      `SELECT it.*, s.name AS school_name, s.code AS school_code, s.email_domain, s.location AS school_location,
              c.name AS class_name
       FROM invite_tokens it
       LEFT JOIN schools s ON it.school_id = s.id
       LEFT JOIN classes c ON c.id = it.class_id
       WHERE it.token = $1 AND it.used = FALSE AND it.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'This invitation link is invalid or has expired.' });
    }
    const row = result.rows[0];
    res.json({
      role: row.role,
      can_create_school: row.can_create_school,
      school_id: row.school_id,
      school_name: row.school_name,
      school_code: row.school_code,
      school_location: row.school_location,
      email_domain: row.email_domain,
      class_id: row.class_id || null,
      class_name: row.class_name || null,
      invite_type: row.class_id ? 'co_teacher' : 'school',
    });
  } catch (err) {
    console.error('[invite-preview]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET check school email username availability (staff signup)
router.get('/check-school-email', async (req, res) => {
  const local = normalizeLocalPart(req.query.local);
  const code = String(req.query.code || req.query.school_code || '').trim().toUpperCase();
  if (!local) return res.status(400).json({ error: 'Email username is required.' });
  if (local.length < 2) return res.status(400).json({ error: 'Username is too short.' });
  try {
    const { getStaffSignupEmailDomain } = require('../lib/schoolDomain');
    let domain;
    let schoolName = null;
    if (code) {
      const schoolRes = await pool.query(
        'SELECT id, name, email_domain FROM schools WHERE code = $1 LIMIT 1',
        [code]
      );
      if (!schoolRes.rows.length) {
        return res.status(404).json({ error: 'Invalid school code.' });
      }
      domain = await ensureSchoolEmailDomain(pool, schoolRes.rows[0]);
      schoolName = schoolRes.rows[0].name;
      if (!domain) {
        return res.status(400).json({ error: 'School email domain is not configured.' });
      }
    } else {
      domain = getStaffSignupEmailDomain();
    }
    const email = buildSchoolEmail(local, domain);
    const taken = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    res.json({
      available: taken.rows.length === 0,
      email,
      email_domain: domain,
      school_name: schoolName,
      using_platform_domain: !code,
    });
  } catch (err) {
    console.error('[check-school-email]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/staff-signup-domain', async (req, res) => {
  const { getStaffSignupEmailDomain } = require('../lib/schoolDomain');
  res.json({ email_domain: getStaffSignupEmailDomain() });
});

// POST validate email (Gmail or school domain + optional mailbox check)
router.post('/validate-email', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = String(req.body.school_code || '').trim().toUpperCase();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    let schoolDomain = null;
    if (code) {
      const s = await pool.query('SELECT id, name, email_domain FROM schools WHERE code=$1', [code]);
      if (s.rows.length) schoolDomain = await ensureSchoolEmailDomain(pool, s.rows[0]);
    } else if (req.body.school_id) {
      const s = await pool.query('SELECT id, name, email_domain FROM schools WHERE id=$1', [req.body.school_id]);
      if (s.rows.length) schoolDomain = await ensureSchoolEmailDomain(pool, s.rows[0]);
    }

    const result = await validateEmailForSignup(email, {
      schoolDomain,
      strict: STRICT_EMAIL,
      role: req.body.role || null,
    });
    if (!result.valid) {
      return res.status(400).json({ error: result.reason, mailbox: result.mailbox });
    }
    res.json({
      valid: true,
      type: result.type,
      mailbox: result.mailbox,
    });
  } catch (err) {
    console.error('[validate-email]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create school
router.post('/schools', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email_domain = (req.body.email_domain || '').trim() || null;
  const welcome_message = (req.body.welcome_message || '').trim() || null;
  const code = (req.body.code || '').trim().toUpperCase() || randomSchoolCode();
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (name.length > 200) return res.status(400).json({ error: 'School name is too long.' });
  try {
    const result = await pool.query(
      `INSERT INTO schools (name, code, email_domain, welcome_message)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         code = COALESCE(NULLIF(EXCLUDED.code, ''), schools.code),
         email_domain = COALESCE(NULLIF(EXCLUDED.email_domain, ''), schools.email_domain),
         welcome_message = COALESCE(NULLIF(EXCLUDED.welcome_message, ''), schools.welcome_message)
       RETURNING *`,
      [name, code, email_domain, welcome_message]
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
  let email = (req.body.email || '').trim().toLowerCase();
  const schoolEmailLocal = normalizeLocalPart(req.body.school_email_local || req.body.school_email);
  let { password, role, school_id, school_code, phone, invite_token, parent_token } = req.body;
  const newSchoolName = (req.body.new_school_name || '').trim();
  const newSchoolLocation = (req.body.new_school_location || '').trim();

  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password are required.' });
  }

  let parentInviteRow = null;
  if (parent_token) {
    const pInv = await pool.query(
      `SELECT pit.*, u.name AS student_name FROM parent_invite_tokens pit
       JOIN users u ON u.id = pit.student_id
       WHERE pit.token=$1 AND pit.used=FALSE AND pit.expires_at > NOW() LIMIT 1`,
      [String(parent_token).trim()]
    );
    if (pInv.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired parent invitation.' });
    }
    parentInviteRow = pInv.rows[0];
    role = 'parent';
  }

  let inviteRow = null;
  if (invite_token && !parentInviteRow) {
    const inv = await pool.query(
      `SELECT * FROM invite_tokens WHERE token=$1 AND used=FALSE AND expires_at > NOW() LIMIT 1`,
      [String(invite_token).trim()]
    );
    if (inv.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invitation link.' });
    }
    inviteRow = inv.rows[0];
    role = inviteRow.role;
    if (inviteRow.school_id) school_id = inviteRow.school_id;
  }

  if (!role) {
    return res.status(400).json({ error: 'Role is required.' });
  }

  if (!['student', 'teacher', 'head_teacher', 'parent'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and include letters and numbers.' });
  }
  if (name.length > 150) return res.status(400).json({ error: 'Name is too long.' });

  try {
    let resolvedSchoolId = school_id || null;
    let schoolCode = null;
    let schoolWelcomeMessage = null;
    const schoolCodeInput = String(school_code || '').trim().toUpperCase();
    let codeBasedSignup = false;

    if (inviteRow && inviteRow.can_create_school && role === 'head_teacher') {
      if (!newSchoolName) {
        return res.status(400).json({ error: 'School name is required for this invitation.' });
      }
      const code = randomSchoolCode();
      const slug = newSchoolName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const emailDomain = slug ? `${slug}.edu` : null;
      const schoolRes = await pool.query(
        `INSERT INTO schools (name, location, code, email_domain) VALUES ($1,$2,$3,$4) RETURNING *`,
        [newSchoolName, newSchoolLocation || null, code, emailDomain]
      );
      resolvedSchoolId = schoolRes.rows[0].id;
      schoolCode = schoolRes.rows[0].code;
    } else if (inviteRow && inviteRow.school_id) {
      const sRes = await pool.query('SELECT id, name, code, welcome_message FROM schools WHERE id=$1', [inviteRow.school_id]);
      if (sRes.rows.length > 0) {
        resolvedSchoolId = sRes.rows[0].id;
        schoolCode = sRes.rows[0].code;
        schoolWelcomeMessage = sRes.rows[0].welcome_message;
        codeBasedSignup = true;
      }
      if (role === 'head_teacher' && resolvedSchoolId) {
        const existingHT = await pool.query(
          "SELECT id FROM users WHERE school_id=$1 AND role='head_teacher' AND is_approved=TRUE LIMIT 1",
          [resolvedSchoolId]
        );
        if (existingHT.rows.length > 0) {
          return res.status(409).json({ error: 'This school already has an active Head Teacher.' });
        }
      }
    }

    // ── School-code based signup for head_teacher and teacher ─────────────
    if (!inviteRow && (role === 'head_teacher' || role === 'teacher') && schoolCodeInput) {
      const codeRes = await pool.query(
        'SELECT id, name, code, email_domain, welcome_message FROM schools WHERE code=$1 LIMIT 1',
        [schoolCodeInput]
      );
      if (codeRes.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid school code. Please check the code given by your Admin or Head Teacher.' });
      }
      const codeSchool = codeRes.rows[0];

      if (role === 'head_teacher') {
        const existingHT = await pool.query(
          "SELECT id FROM users WHERE school_id=$1 AND role='head_teacher' AND is_approved=TRUE LIMIT 1",
          [codeSchool.id]
        );
        if (existingHT.rows.length > 0) {
          return res.status(409).json({ error: 'This school already has an active Head Teacher. Contact your school admin.' });
        }
      }

      if (role === 'teacher') {
        const htExists = await pool.query(
          "SELECT id FROM users WHERE school_id=$1 AND role='head_teacher' AND is_approved=TRUE LIMIT 1",
          [codeSchool.id]
        );
        if (htExists.rows.length === 0) {
          return res.status(400).json({ error: 'This school does not have an active Head Teacher yet. Please contact your school administration.' });
        }
      }

      resolvedSchoolId = codeSchool.id;
      schoolCode = codeSchool.code;
      schoolWelcomeMessage = codeSchool.welcome_message;
      codeBasedSignup = true;
    }

    // Student school selection
    if (role === 'student' && !resolvedSchoolId) {
      if (!school_id) {
        return res.status(400).json({ error: 'Student signup requires a school selection.' });
      }
      resolvedSchoolId = school_id;
    }

    let schoolDomainForEmail = null;
    if (resolvedSchoolId) {
      const sd = await pool.query('SELECT id, name, email_domain FROM schools WHERE id=$1', [resolvedSchoolId]);
      if (sd.rows.length) {
        schoolDomainForEmail = await ensureSchoolEmailDomain(pool, sd.rows[0]);
      }
    }

    const isStaffRole = role === 'teacher' || role === 'head_teacher';

    if (isStaffRole) {
      if (!schoolEmailLocal) {
        return res.status(400).json({
          error: 'Create your school email username (e.g. john for john@school.edu).',
        });
      }
      const { getStaffSignupEmailDomain } = require('../lib/schoolDomain');
      const domainForStaff = schoolDomainForEmail || getStaffSignupEmailDomain();
      email = buildSchoolEmail(schoolEmailLocal, domainForStaff);
      if (!email) {
        return res.status(400).json({ error: 'Invalid school email username.' });
      }
    } else {
      if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email address.' });
      }
      const emailCheck = await validateEmailForSignup(email, {
        schoolDomain: schoolDomainForEmail,
        strict: parentInviteRow ? false : STRICT_EMAIL,
        role: parentInviteRow ? 'parent' : role,
      });
      if (!emailCheck.valid) {
        return res.status(400).json({ error: emailCheck.reason });
      }
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const needsSchoolApproval = role === 'teacher' && resolvedSchoolId && codeBasedSignup;
    const isApproved = !needsSchoolApproval;
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, school_id, is_approved, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, email, role, school_id, is_approved`,
      [name, email, hashed, role, resolvedSchoolId, isApproved, phone || null]
    );
    const user = result.rows[0];

    if (inviteRow) {
      await pool.query('UPDATE invite_tokens SET used=TRUE WHERE id=$1', [inviteRow.id]);
      if (inviteRow.class_id && role === 'teacher') {
        await pool.query(
          'INSERT INTO class_co_teachers (class_id, teacher_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [inviteRow.class_id, user.id]
        );
      }
    }

    if (parentInviteRow) {
      await pool.query('UPDATE parent_invite_tokens SET used=TRUE WHERE id=$1', [parentInviteRow.id]);
      await pool.query(
        'INSERT INTO parent_children (parent_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [user.id, parentInviteRow.student_id]
      );
    }

    if (!isApproved) {
      audit('register', { email, role, status: 'pending_approval' });
      return res.status(202).json({
        pending: true,
        message: 'Konti yawe yoherejwe. Tegereza ko umuyobozi w\'ishuri ayemera mbere yo kwinjira.',
        school_code: schoolCode,
        school_welcome_message: schoolWelcomeMessage,
        login_email: email,
      });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    audit('register', { email, role });
    res.status(201).json({
      token,
      user: userPayload(user),
      login_email: email,
    });
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
    res.json({
      token,
      user: userPayload(user),
    });
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
    audit('password_reset_requested', { email });
    const body = { message: 'If this email exists, a 6-digit reset code was generated. Enter it on the next screen.' };
    if (process.env.EXPOSE_RESET_CODE === 'true') {
      body.dev_code = token;
    }
    try {
      const { sendMail } = require('../lib/optionalMailer');
      const mailed = await sendMail({
        to: email,
        subject: 'UClass password reset code',
        text: `Your reset code is ${token}. It expires in 15 minutes.`,
      });
      if (mailed.sent) body.message = 'Reset code sent to your email.';
    } catch {
      /* in-app / dev_code fallback */
    }
    res.json(body);
  } catch (err) {
    console.error('[forgot-password]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/check-email — exists check for password reset UI (no 404)
router.post('/check-email', forgotLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
  try {
    const result = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Nta konti iboneka kuri iyi imeyili. Reba neza cyangwa uvugishe umuyobozi.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[check-email]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/auth/reset-password-direct — legacy; disabled in production (use reset-password + OTP)
router.post('/reset-password-direct', forgotLimiter, async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_PASSWORD_RESET !== 'true') {
    return res.status(403).json({
      error: 'Use the reset code from forgot-password. Direct reset is disabled in production.',
    });
  }
  const email = (req.body.email || '').trim().toLowerCase();
  const newPassword = req.body.newPassword || req.body.new_password || '';

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
      return res.status(400).json({ error: 'Nta konti iboneka kuri iyi imeyili.' });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, userResult.rows[0].id]);
    audit('password_reset_direct', { email });
    res.json({ message: 'Password reset successfully.' });
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

// Student: parent invite (stable path on /api/auth for older API deploys)
router.post('/parent-invite', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can create a parent invite from here.' });
  }
  try {
    const { buildParentInviteResponse } = require('../lib/parentInvite');
    const row = await pool.query(
      `SELECT id, name FROM users WHERE id=$1 AND role='student'`,
      [req.user.id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Student not found.' });
    const payload = await buildParentInviteResponse(req, row.rows[0].id, row.rows[0].name);
    res.json(payload);
  } catch (err) {
    console.error('[auth/parent-invite]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: userPayload(result.rows[0]) });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

