const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { schoolDomainFromName, normalizeLocalPart, buildSchoolEmail, persistLoginEmailDomain, loginEmailDomainForSchool } = require('../lib/schoolDomain');
const { validateEmailForSignup, isSchoolDomainEmail } = require('../lib/emailValidate');
const { schoolEmailCapabilities } = require('../lib/schoolEmailCapabilities');
const {
  isSchoolMailEnabled,
  ensureSchoolMailSchema,
  resolveMailboxDomain,
  buildMailboxAddress,
  mailboxDomainForSchool,
  sendForwardVerificationCode,
  verifyForwardCode,
  consumeForwardToken,
  attachMailbox,
  mailboxCapabilities,
} = require('../lib/schoolMail');
require('dotenv').config();

ensureSchoolMailSchema(pool).catch((e) => console.error('[auth] school mail schema:', e.message));

const STRICT_EMAIL = process.env.STRICT_EMAIL_VALIDATE === 'true';

function userPayload(row) {
  const payload = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    school_id: row.school_id,
    is_approved: row.is_approved !== false,
    email_confirmed: row.email_confirmed !== false,
    is_alumni: row.is_alumni === true,
    graduation_year: row.graduation_year || null,
    district: row.district || null,
    sector: row.sector || null,
    school_name_text: row.school_name_text || null,
    is_external: row.is_external === true,
  };
  if (row.school_name) payload.school_name = row.school_name;
  return payload;
}

async function ensureSchoolEmailDomain(pool, schoolRow) {
  return persistLoginEmailDomain(pool, schoolRow);
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
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('teacher', 'student', 'admin', 'head_teacher', 'parent', 'guest', 'alumni'));
`).catch(console.error);

// Add school metadata columns if missing for head teacher / school code flows
pool.query(`
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255);
  ALTER TABLE schools ADD COLUMN IF NOT EXISTS welcome_message TEXT;
`).catch(console.error);

// Email confirmation for HT / Teacher / Guest self-signups.
// Existing accounts default to confirmed (TRUE) so nobody is locked out.
pool.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN NOT NULL DEFAULT TRUE;
  CREATE TABLE IF NOT EXISTS email_confirm_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`).catch(console.error);

// Alumni columns migration
pool.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status VARCHAR(20) DEFAULT 'active';
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
    let emailDomain = row.email_domain;
    if (row.school_id && row.school_name) {
      emailDomain = await ensureSchoolEmailDomain(pool, {
        id: row.school_id,
        name: row.school_name,
        email_domain: row.email_domain,
      });
    }
    res.json({
      role: row.role,
      can_create_school: row.can_create_school,
      school_id: row.school_id,
      school_name: row.school_name,
      school_code: row.school_code,
      school_location: row.school_location,
      email_domain: emailDomain,
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
router.post('/school-mail/send-code', authLimiter, async (req, res) => {
  if (!isSchoolMailEnabled()) {
    return res.status(503).json({ error: 'School mail is not enabled on this server.' });
  }
  try {
    const result = await sendForwardVerificationCode(pool, req.body.personal_email);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({
      ok: true,
      mail_sent: result.mail_sent,
      ...(result.dev_code ? { dev_code: result.dev_code } : {}),
    });
  } catch (err) {
    console.error('[school-mail/send-code]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/school-mail/confirm-code', authLimiter, async (req, res) => {
  if (!isSchoolMailEnabled()) {
    return res.status(503).json({ error: 'School mail is not enabled on this server.' });
  }
  try {
    const result = await verifyForwardCode(
      pool,
      req.body.personal_email,
      req.body.code
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('[school-mail/confirm-code]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/check-school-email', async (req, res) => {
  const local = normalizeLocalPart(req.query.local);
  const code = String(req.query.code || req.query.school_code || '').trim().toUpperCase();
  const schoolNameInput = String(req.query.school_name || '').trim();
  if (!local) return res.status(400).json({ error: 'Email username is required.' });
  if (local.length < 2) return res.status(400).json({ error: 'Username is too short.' });
  try {
    let domain;
    let schoolName = null;
    let schoolRow = null;
    if (code) {
      const schoolRes = await pool.query(
        'SELECT id, name, email_domain, mail_slug FROM schools WHERE code = $1 LIMIT 1',
        [code]
      );
      if (!schoolRes.rows.length) {
        return res.status(404).json({ error: 'Invalid school code.' });
      }
      schoolRow = schoolRes.rows[0];
      schoolName = schoolRow.name;
      domain = schoolRow.email_domain || schoolDomainFromName(schoolRow.name);
      if (!domain) {
        return res.status(400).json({ error: 'School email domain is not configured.' });
      }
    } else if (req.query.school_id) {
      const sid = parseInt(req.query.school_id, 10);
      if (!sid) return res.status(400).json({ error: 'Invalid school.' });
      const schoolRes = await pool.query(
        'SELECT id, name, email_domain FROM schools WHERE id = $1 LIMIT 1',
        [sid]
      );
      if (!schoolRes.rows.length) return res.status(404).json({ error: 'School not found.' });
      schoolRow = schoolRes.rows[0];
      schoolName = schoolRow.name;
      domain = schoolRow.email_domain || schoolDomainFromName(schoolRow.name);
    } else if (schoolNameInput) {
      schoolName = schoolNameInput;
      schoolRow = { name: schoolNameInput, mail_slug: null, email_domain: null };
      domain = schoolDomainFromName(schoolNameInput);
      if (!domain) {
        return res.status(400).json({ error: 'Enter a valid school name (letters and numbers).' });
      }
    } else {
      return res.status(400).json({
        error: 'Enter your school name to create your login email.',
      });
    }
    const email = buildSchoolEmail(local, domain);
    const taken = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const caps =
      mailboxCapabilities(isSchoolMailEnabled(), false) ||
      schoolEmailCapabilities('staff');
    res.json({
      available: taken.rows.length === 0,
      email,
      email_domain: domain,
      school_name: schoolName,
      using_platform_domain: isSchoolMailEnabled(),
      real_mailbox: isSchoolMailEnabled(),
      capabilities: caps,
    });
  } catch (err) {
    console.error('[check-school-email]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/staff-signup-domain', async (req, res) => {
  const { getStaffSignupEmailDomain } = require('../lib/schoolDomain');
  const legacy = getStaffSignupEmailDomain();
  res.json({
    email_domain: legacy,
    requires_school_code: false,
    hint: legacy
      ? 'Legacy domain — prefer signup with your school name for @schoolname.edu.'
      : 'Enter your school name on the form to get your login email (@schoolname.edu).',
  });
});

// POST validate email (Gmail or school domain + optional mailbox check)
router.post('/validate-email', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = String(req.body.school_code || '').trim().toUpperCase();
  const parentToken = String(req.body.parent_token || '').trim();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    let schoolDomain = null;
    let role = req.body.role || null;
    let skipMailbox = false;

    if (parentToken) {
      const pInv = await pool.query(
        `SELECT id FROM parent_invite_tokens
         WHERE token=$1 AND used=FALSE AND expires_at > NOW() LIMIT 1`,
        [parentToken]
      );
      if (!pInv.rows.length) {
        return res.status(400).json({ error: 'Invalid or expired parent invitation.' });
      }
      role = 'parent';
      skipMailbox = true;
    }

    if (code) {
      const s = await pool.query('SELECT id, name, email_domain FROM schools WHERE code=$1', [code]);
      if (s.rows.length) schoolDomain = await ensureSchoolEmailDomain(pool, s.rows[0]);
    } else if (req.body.school_id) {
      const s = await pool.query('SELECT id, name, email_domain FROM schools WHERE id=$1', [req.body.school_id]);
      if (s.rows.length) schoolDomain = await ensureSchoolEmailDomain(pool, s.rows[0]);
    }

    if (role === 'parent') skipMailbox = true;

    const result = await validateEmailForSignup(email, {
      schoolDomain,
      strict: role === 'parent' ? false : STRICT_EMAIL,
      role,
      skipMailbox,
    });
    if (!result.valid) {
      return res.status(400).json({ error: result.reason, mailbox: result.mailbox });
    }
    const capKind = result.type === 'school' ? 'school' : 'personal';
    res.json({
      valid: true,
      type: result.type,
      mailbox: result.mailbox,
      capabilities: schoolEmailCapabilities(capKind),
    });
  } catch (err) {
    console.error('[validate-email]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create school
router.post('/schools', async (req, res) => {
  const name = (req.body.name || '').trim();
  let email_domain = (req.body.email_domain || '').trim() || null;
  const welcome_message = (req.body.welcome_message || '').trim() || null;
  const code = (req.body.code || '').trim().toUpperCase() || randomSchoolCode();
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (name.length > 200) return res.status(400).json({ error: 'School name is too long.' });
  if (!email_domain) email_domain = schoolDomainFromName(name);
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
  const staffSchoolName = (req.body.staff_school_name || req.body.school_name || '').trim();
  const district = (req.body.district || '').trim();
  const sector = (req.body.sector || '').trim();
  const parentGmail = (req.body.parent_gmail || '').trim().toLowerCase();
  const parentPhone = (req.body.parent_phone || '').trim();
  const schoolNameText = (req.body.school_name_text || '').trim();
  const isExternal = Boolean(req.body.is_external);
  const aiRevisionShare = (req.body.ai_revision_share || '').trim();

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

  if (!['student', 'teacher', 'head_teacher', 'parent', 'guest'].includes(role)) {
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
      await resolveMailboxDomain(pool, schoolRes.rows[0]);
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
    let schoolRowForMail = null;
    if (resolvedSchoolId) {
      const sd = await pool.query(
        'SELECT id, name, email_domain, mail_slug FROM schools WHERE id=$1',
        [resolvedSchoolId]
      );
      if (sd.rows.length) {
        schoolRowForMail = sd.rows[0];
        schoolDomainForEmail = await ensureSchoolEmailDomain(pool, schoolRowForMail);
      }
    } else if (staffSchoolName && (role === 'teacher' || role === 'head_teacher')) {
      schoolRowForMail = { name: staffSchoolName, email_domain: null, mail_slug: null };
      schoolDomainForEmail = mailboxDomainForSchool(schoolRowForMail);
    }

    const isStaffRole = role === 'teacher' || role === 'head_teacher';
    let forwardTo = null;

    if (isStaffRole && !schoolEmailLocal && email) {
      // Personal email signup (e.g. Gmail) for Head Teacher / Teacher
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email address.' });
      }
      const emailCheck = await validateEmailForSignup(email, {
        schoolDomain: schoolDomainForEmail,
        strict: STRICT_EMAIL,
        role,
        skipMailbox: true,
      });
      if (!emailCheck.valid) {
        return res.status(400).json({ error: emailCheck.reason });
      }
    } else if (isStaffRole) {
      if (!schoolEmailLocal) {
        return res.status(400).json({
          error: 'Create your school email username (e.g. john for john@school.edu).',
        });
      }
      let domainForStaff = schoolDomainForEmail;
      if (!domainForStaff && schoolRowForMail) {
        domainForStaff = loginEmailDomainForSchool(schoolRowForMail);
      }
      if (!domainForStaff && inviteRow?.can_create_school && newSchoolName) {
        domainForStaff = schoolDomainFromName(newSchoolName);
      }
      if (!domainForStaff && staffSchoolName) {
        domainForStaff = schoolDomainFromName(staffSchoolName);
      }
      if (!domainForStaff) {
        return res.status(400).json({
          error:
            'Enter your school name (or choose a school) to get your @schoolname.edu login email.',
        });
      }
      email = buildSchoolEmail(schoolEmailLocal, domainForStaff);
      if (!email) {
        return res.status(400).json({ error: 'Invalid school email username.' });
      }
    } else if (role === 'student') {
      const studentLocal = normalizeLocalPart(req.body.school_email_local || req.body.school_email);
      if (studentLocal && resolvedSchoolId) {
        let domain = schoolDomainForEmail;
        if (!domain && schoolRowForMail) {
          domain = loginEmailDomainForSchool(schoolRowForMail);
        }
        email = buildSchoolEmail(studentLocal, domain);
      }
      if (!email) {
        return res.status(400).json({
          error: 'Choose your school and create your login as name@schoolname.edu.',
        });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid school email.' });
      }
      const emailCheck = await validateEmailForSignup(email, {
        schoolDomain: schoolDomainForEmail,
        strict: STRICT_EMAIL,
        role: 'student',
        skipMailbox: true,
      });
      if (!emailCheck.valid) {
        return res.status(400).json({ error: emailCheck.reason });
      }
    } else if (role === 'guest') {
      const { GUEST_EMAIL_DOMAIN } = require('../lib/quizShares');
      const guestLocal = normalizeLocalPart(
        req.body.guest_email_local || req.body.school_email_local || req.body.email_local
      );
      if (!guestLocal && email) {
        // Personal email signup for guests
        if (!isValidEmail(email)) {
          return res.status(400).json({ error: 'Invalid email address.' });
        }
      } else {
        if (!guestLocal) {
          return res.status(400).json({ error: 'Enter your email for your guest login.' });
        }
        email = buildSchoolEmail(guestLocal, GUEST_EMAIL_DOMAIN);
        if (!email) {
          return res.status(400).json({ error: 'Invalid guest username.' });
        }
      }
      resolvedSchoolId = null;
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
        skipMailbox: Boolean(parentInviteRow),
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
    // HT / Teacher / Guest self-signups must confirm their email before acting
    const needsEmailConfirm =
      !inviteRow && !parentInviteRow && ['head_teacher', 'teacher', 'guest'].includes(role);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, school_id, is_approved, phone, email_confirmed,
        district, sector, parent_gmail, parent_phone, school_name_text, is_external)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, name, email, role, school_id, is_approved, email_confirmed`,
      [name, email, hashed, role, resolvedSchoolId, isApproved, phone || null, !needsEmailConfirm,
       district || null, sector || null, parentGmail || null, parentPhone || null, schoolNameText || null, isExternal]
    );
    const user = result.rows[0];

    let confirmEmailSent = false;
    if (needsEmailConfirm) {
      try {
        const { sendConfirmationEmail, newConfirmToken, hashToken } = require('../lib/confirmationEmail');
        const confirmToken = newConfirmToken();
        await pool.query(
          `INSERT INTO email_confirm_tokens (user_id, token_hash, expires_at)
           VALUES ($1,$2,NOW() + INTERVAL '7 days')`,
          [user.id, hashToken(confirmToken)]
        );
        const mailed = await sendConfirmationEmail({
          to: email,
          name: user.name,
          role,
          token: confirmToken,
        });
        confirmEmailSent = Boolean(mailed.sent);
        audit('confirm_email_send', { email, role, sent: confirmEmailSent });
      } catch (mailErr) {
        console.error('[register confirm-email]', mailErr.message);
      }
    }

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
      const { linkParentFromInviteToken } = require('../lib/parentInvite');
      await linkParentFromInviteToken(user.id, parentInviteRow.token);
    }

    let guestShareRedirect = null;
    const shareTok = String(req.body.quiz_share_token || req.body.share_token || '').trim();
    if (shareTok) {
      const { claimShareForUser, loadShareByToken } = require('../lib/quizShares');
      if (role === 'guest') {
        const claimed = await claimShareForUser(user.id, shareTok);
        if (claimed) {
          guestShareRedirect = {
            class_id: claimed.class_id,
            quiz_id: claimed.quiz_id,
          };
        }
      } else if (role === 'student') {
        const share = await loadShareByToken(shareTok);
        if (share) {
          await pool.query(
            'INSERT INTO class_members (class_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [share.class_id, user.id]
          );
          guestShareRedirect = {
            class_id: share.class_id,
            quiz_id: share.quiz_id,
          };
        }
      }
    }

    if (isStaffRole && isSchoolMailEnabled() && forwardTo && schoolRowForMail) {
      const mailboxEmail = await attachMailbox(pool, {
        userId: user.id,
        schoolId: resolvedSchoolId,
        local: schoolEmailLocal,
        schoolRow: schoolRowForMail,
        forwardTo,
      });
      if (mailboxEmail && mailboxEmail !== user.email) {
        await pool.query('UPDATE users SET email = $1 WHERE id = $2', [mailboxEmail, user.id]);
        user.email = mailboxEmail;
        email = mailboxEmail;
      }
    }

    const emailCapabilities =
      role === 'guest'
        ? schoolEmailCapabilities('personal')
        : isStaffRole && isSchoolMailEnabled()
          ? mailboxCapabilities(true, Boolean(forwardTo))
          : isStaffRole
            ? schoolEmailCapabilities('staff')
            : schoolDomainForEmail && isSchoolDomainEmail(email, schoolDomainForEmail)
              ? schoolEmailCapabilities('school')
              : schoolEmailCapabilities('personal');

    if (!isApproved) {
      audit('register', { email, role, status: 'pending_approval' });
      return res.status(202).json({
        pending: true,
        message: 'Konti yawe yoherejwe. Tegereza ko umuyobozi w\'ishuri ayemera mbere yo kwinjira.',
        school_code: schoolCode,
        school_welcome_message: schoolWelcomeMessage,
        login_email: email,
        capabilities: emailCapabilities,
      });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    audit('register', { email, role });
    res.status(201).json({
      token,
      user: userPayload(user),
      login_email: email,
      capabilities: emailCapabilities,
      guest_share_redirect: guestShareRedirect,
      ai_revision_share: Boolean(aiRevisionShare),
      confirm_email_sent: confirmEmailSent,
      email_confirmed: user.email_confirmed !== false,
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
    const result = await pool.query(
      `SELECT u.*, s.name AS school_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.email = $1`,
      [email]
    );
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

    let parentInviteLinked = null;
    const parentTok = String(req.body.parent_token || '').trim();
    if (parentTok && user.role === 'parent') {
      const { linkParentFromInviteToken } = require('../lib/parentInvite');
      parentInviteLinked = await linkParentFromInviteToken(user.id, parentTok);
    }

    let quizShareRedirect = null;
    const shareTok = String(req.body.quiz_share_token || '').trim();
    if (shareTok) {
      const { claimShareForUser, loadShareByToken } = require('../lib/quizShares');
      if (user.role === 'guest') {
        const claimed = await claimShareForUser(user.id, shareTok);
        if (claimed) {
          quizShareRedirect = { class_id: claimed.class_id, quiz_id: claimed.quiz_id };
        }
      } else if (user.role === 'student') {
        const share = await loadShareByToken(shareTok);
        if (share) {
          await pool.query(
            'INSERT INTO class_members (class_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [share.class_id, user.id]
          );
          quizShareRedirect = { class_id: share.class_id, quiz_id: share.quiz_id };
        }
      }
    }

    res.json({
      token,
      user: userPayload(user),
      quiz_share_redirect: quizShareRedirect,
      parent_invite_linked: parentInviteLinked,
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

async function resetPasswordByEmail(req, res) {
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
      return res.status(400).json({ error: 'Nta konti iboneka kuri iyi imeyili. Reba neza cyangwa uvugishe umuyobozi.' });
    }
    const userId = userResult.rows[0].id;
    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, userId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);
    audit('password_reset_done', { email });
    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// POST /api/auth/reset-password — set new password by email (no OTP code)
router.post('/reset-password', forgotLimiter, resetPasswordByEmail);
router.post('/reset-password-direct', forgotLimiter, resetPasswordByEmail);

const { handleStudentParentInvite } = require('../lib/studentParentInvite');

router.get('/parent-invite', authenticateToken, handleStudentParentInvite);
router.post('/parent-invite', authenticateToken, handleStudentParentInvite);

// ── Email confirmation (HT / Teacher / Guest self-signup) ────────────────────

// GET /api/auth/confirm-email?token=… — clicked from the confirmation email
router.get('/confirm-email', async (req, res) => {
  const { hashToken, FRONTEND_URL } = require('../lib/confirmationEmail');
  const token = String(req.query.token || '').trim();
  const useJson = req.query.json === '1';
  const respond = (status) =>
    useJson
      ? res.json({ status })
      : res.redirect(`${FRONTEND_URL}/email-confirmed?status=${status}`);
  if (!token || token.length < 32) return respond('invalid');
  try {
    const row = await pool.query(
      `SELECT ect.id, ect.user_id, ect.expires_at, u.email_confirmed
       FROM email_confirm_tokens ect JOIN users u ON u.id = ect.user_id
       WHERE ect.token_hash = $1 LIMIT 1`,
      [hashToken(token)]
    );
    if (!row.rows.length) return respond('invalid');
    const rec = row.rows[0];
    if (new Date(rec.expires_at) < new Date()) {
      return respond('expired');
    }
    await pool.query('UPDATE users SET email_confirmed = TRUE WHERE id = $1', [rec.user_id]);
    await pool.query('DELETE FROM email_confirm_tokens WHERE user_id = $1', [rec.user_id]);
    audit('confirm_email_ok', { user_id: rec.user_id });
    return respond('ok');
  } catch (err) {
    console.error('[confirm-email]', err);
    return respond('error');
  }
});

// POST /api/auth/resend-confirmation — logged-in user asks for a new email
router.post('/resend-confirmation', forgotLimiter, authenticateToken, async (req, res) => {
  try {
    const u = await pool.query(
      'SELECT id, name, email, role, email_confirmed FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!u.rows.length) return res.status(404).json({ error: 'User not found.' });
    const user = u.rows[0];
    if (user.email_confirmed !== false) {
      return res.json({ ok: true, already_confirmed: true });
    }
    const { sendConfirmationEmail, newConfirmToken, hashToken } = require('../lib/confirmationEmail');
    const confirmToken = newConfirmToken();
    await pool.query('DELETE FROM email_confirm_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      `INSERT INTO email_confirm_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,NOW() + INTERVAL '7 days')`,
      [user.id, hashToken(confirmToken)]
    );
    const mailed = await sendConfirmationEmail({
      to: user.email,
      name: user.name,
      role: user.role,
      token: confirmToken,
    });
    audit('confirm_email_resend', { email: user.email, sent: Boolean(mailed.sent) });
    res.json({ ok: true, sent: Boolean(mailed.sent) });
  } catch (err) {
    console.error('[resend-confirmation]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.*, s.name AS school_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: userPayload(result.rows[0]) });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

