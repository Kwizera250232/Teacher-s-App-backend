const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = [authenticateToken, requireRole('admin')];
const schoolBoardAccess = [authenticateToken, requireRole('head_teacher')];
const schoolProvisionAccess = [authenticateToken, requireRole('head_teacher', 'teacher')];
const headTeacherOnly = [authenticateToken, requireRole('head_teacher')];

pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255)`).catch(console.error);
pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_school_it BOOLEAN NOT NULL DEFAULT FALSE`).catch(console.error);

function sanitizeEmailPart(value, fallback = 'student') {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
  return cleaned || fallback;
}

function schoolDomainFromName(schoolName) {
  const compact = sanitizeEmailPart(schoolName, 'school').replace(/\./g, '');
  const root = compact.length >= 3 ? compact : 'school';
  return `${root}.edu`;
}

function resolveSchoolDomain(schoolName, rawDomain) {
  return schoolDomainFromName(schoolName || rawDomain || 'school');
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
    return `Only school email addresses ending with @${expectedDomain} are allowed. Contact School IT for an official school email.`;
  }
  return 'Only school email addresses ending with your school .edu domain are allowed. Contact School IT or Head Teacher for an official school email.';
}

function generateStrongPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  if (!/[A-Za-z]/.test(out)) out = `A${out.slice(1)}`;
  if (!/\d/.test(out)) out = `${out.slice(0, -1)}7`;
  return out;
}

async function generateUniqueStudentEmail(client, studentName, school) {
  return generateUniqueStudentEmailWithLocal(client, sanitizeEmailPart(studentName, 'student'), school);
}

async function generateUniqueStudentEmailWithLocal(client, preferredLocalPart, school) {
  const localBase = sanitizeEmailPart(preferredLocalPart, 'student');
  const domain = resolveSchoolDomain(school?.name, school?.email_domain);
  let suffix = 1;
  while (suffix <= 9999) {
    const local = suffix === 1 ? localBase : `${localBase}${suffix}`;
    const candidate = `${local}@${domain}`;
    const exists = await client.query('SELECT 1 FROM users WHERE email=$1 LIMIT 1', [candidate]);
    if (exists.rows.length === 0) return candidate;
    suffix += 1;
  }
  throw new Error('Could not generate unique school email.');
}

async function getProvisionContext(userId) {
  const result = await pool.query(
    `SELECT u.id, u.role, u.school_id, u.is_school_it,
            s.id AS school_id_ref, s.name AS school_name, s.email_domain
       FROM users u
  LEFT JOIN schools s ON s.id = u.school_id
      WHERE u.id = $1
      LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const allowed = row.role === 'head_teacher' || (row.role === 'teacher' && row.is_school_it === true);
  return {
    userId: row.id,
    role: row.role,
    schoolId: row.school_id,
    schoolName: row.school_name,
    emailDomain: resolveSchoolDomain(row.school_name, row.email_domain),
    isSchoolIT: row.is_school_it === true,
    allowed,
  };
}

async function createTeacherAccount({
  schoolId,
  schoolName,
  schoolEmailDomain,
  name,
  phone,
  emailLocalPart,
  manualEmail,
  autoGenerateEmail,
  manualPassword,
  isSchoolIT = false,
}) {
  const requiredDomain = resolveSchoolDomain(schoolName, schoolEmailDomain);

  let email = manualEmail;
  if (!email && autoGenerateEmail) {
    email = await generateUniqueStudentEmailWithLocal(
      pool,
      emailLocalPart || name,
      { id: schoolId, name: schoolName, email_domain: requiredDomain }
    );
  }
  if (!email) {
    throw new Error('Email is required when auto generation is off.');
  }

  if (manualEmail) {
    const manualDomain = emailDomainOf(email);
    if (manualDomain !== requiredDomain) {
      throw new Error(`Only school email addresses ending with @${requiredDomain} are allowed. Contact School IT for an official school email.`);
    }
  }

  const existing = await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
  if (existing.rows.length > 0) {
    throw new Error('Email already exists.');
  }

  const rawPassword = manualPassword || generateStrongPassword();
  const hashed = await bcrypt.hash(rawPassword, 12);

  const inserted = await pool.query(
    `INSERT INTO users (name, email, password, role, school_id, is_approved, phone, is_school_it)
     VALUES ($1,$2,$3,'teacher',$4,TRUE,$5,$6)
     RETURNING id, name, email, role, school_id, phone, is_school_it, created_at`,
    [name, email, hashed, schoolId, phone || null, isSchoolIT === true]
  );

  return {
    teacher: inserted.rows[0],
    credentials: {
      email,
      password: rawPassword,
      generated_email: !manualEmail,
      generated_password: !manualPassword,
    },
  };
}

async function ensureNurseryMediaTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nursery_media_settings (
      id SERIAL PRIMARY KEY,
      interval_days INTEGER NOT NULL DEFAULT 3 CHECK (interval_days BETWEEN 1 AND 30),
      items_per_group INTEGER NOT NULL DEFAULT 2 CHECK (items_per_group BETWEEN 1 AND 10),
      rotation_anchor TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nursery_media_items (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      subject VARCHAR(120),
      lesson_kind VARCHAR(20) NOT NULL CHECK (lesson_kind IN ('song', 'subject')),
      media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('audio', 'video')),
      media_url TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_nursery_media_items_enabled ON nursery_media_items(enabled)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_nursery_media_items_sort ON nursery_media_items(sort_order, id)');

  const settings = await pool.query('SELECT id FROM nursery_media_settings LIMIT 1');
  if (settings.rows.length === 0) {
    await pool.query('INSERT INTO nursery_media_settings DEFAULT VALUES');
  }
}

function rotateItems(items, startIndex, takeCount) {
  if (!Array.isArray(items) || items.length === 0 || takeCount <= 0) return [];
  const out = [];
  for (let i = 0; i < Math.min(takeCount, items.length); i += 1) {
    out.push(items[(startIndex + i) % items.length]);
  }
  return out;
}

function getRotationMeta(intervalDays, anchorDate) {
  const safeInterval = Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : 3;
  const anchor = anchorDate ? new Date(anchorDate) : new Date();
  const now = new Date();
  const msPerWindow = safeInterval * 24 * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, now.getTime() - anchor.getTime());
  const windowIndex = Math.floor(elapsedMs / msPerWindow);
  const currentWindowStart = new Date(anchor.getTime() + windowIndex * msPerWindow);
  const nextChangeAt = new Date(currentWindowStart.getTime() + msPerWindow);
  return { windowIndex, currentWindowStart, nextChangeAt };
}

async function ensureCatBoardTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cat_mark_sheets (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(80) NOT NULL,
      lesson_title VARCHAR(255),
      lesson_topic VARCHAR(255),
      cat_count INTEGER NOT NULL DEFAULT 10,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (class_id, teacher_id, subject)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cat_student_marks (
      id SERIAL PRIMARY KEY,
      sheet_id INTEGER NOT NULL REFERENCES cat_mark_sheets(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      marks JSONB,
      total NUMERIC(6,2) NOT NULL DEFAULT 0,
      percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (sheet_id, student_id)
    )
  `);

  await pool.query(`
    ALTER TABLE cat_student_marks ADD COLUMN IF NOT EXISTS marks JSONB
  `).catch(() => {});

}

// ─── ADMIN IMPERSONATION (View as Teacher/Student) ─────────────────────────
router.post('/impersonate', ...adminOnly, async (req, res) => {
  const targetId = parseInt(req.body.user_id, 10);
  if (!targetId) return res.status(400).json({ error: 'Valid user_id is required.' });

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, school_id, is_suspended
       FROM users
       WHERE id = $1`,
      [targetId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const target = result.rows[0];
    if (!['teacher', 'student'].includes(target.role)) {
      return res.status(400).json({ error: 'You can only view teacher or student accounts.' });
    }
    if (target.is_suspended) {
      return res.status(403).json({ error: 'This account is suspended.' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration: JWT secret missing.' });
    }

    const token = jwt.sign(
      {
        id: target.id,
        role: target.role,
        impersonated_by: req.user.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      token,
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
        school_id: target.school_id,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
router.get('/stats', ...adminOnly, async (req, res) => {
  try {
    const [schools, teachers, students, classes, quizzes, homework, pending, installs] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM schools"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher' AND is_approved=TRUE"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='student'"),
      pool.query("SELECT COUNT(*) FROM classes"),
      pool.query("SELECT COUNT(*) FROM quizzes"),
      pool.query("SELECT COUNT(*) FROM homework"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher' AND is_approved=FALSE"),
      pool.query("SELECT COUNT(*) FROM pwa_installs"),
    ]);
    res.json({
      schools: parseInt(schools.rows[0].count),
      teachers: parseInt(teachers.rows[0].count),
      students: parseInt(students.rows[0].count),
      classes: parseInt(classes.rows[0].count),
      quizzes: parseInt(quizzes.rows[0].count),
      homework: parseInt(homework.rows[0].count),
      pending_teachers: parseInt(pending.rows[0].count),
      installations: parseInt(installs.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Daily registrations for activity graph (last 14 days)
router.get('/activity', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── SCHOOLS ──────────────────────────────────────────────────────────────────
router.get('/schools', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, COUNT(DISTINCT u.id) AS user_count
      FROM schools s
      LEFT JOIN users u ON u.school_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/schools', ...adminOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const location = String(req.body.location || '').trim();
  const rawCode = String(req.body.code || '').trim();
  const emailDomain = resolveSchoolDomain(name, String(req.body.email_domain || '').trim());
  const code = rawCode ? rawCode.toUpperCase() : null;
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (code && !/^[A-Z0-9_-]{4,20}$/.test(code)) {
    return res.status(400).json({ error: 'School code must be 4-20 chars (A-Z, 0-9, _ or -).' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO schools (name, location, code, email_domain) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, location || null, code, emailDomain || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/schools/:id', ...adminOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const location = String(req.body.location || '').trim();
  const rawCode = String(req.body.code || '').trim();
  const emailDomain = resolveSchoolDomain(name, String(req.body.email_domain || '').trim());
  const code = rawCode ? rawCode.toUpperCase() : null;
  if (!name) return res.status(400).json({ error: 'School name is required.' });
  if (code && !/^[A-Z0-9_-]{4,20}$/.test(code)) {
    return res.status(400).json({ error: 'School code must be 4-20 chars (A-Z, 0-9, _ or -).' });
  }
  try {
    const result = await pool.query(
      'UPDATE schools SET name=$1, location=$2, code=$3, email_domain=$4 WHERE id=$5 RETURNING *',
      [name, location || null, code, emailDomain || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'School not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/schools/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM schools WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── TEACHERS ─────────────────────────────────────────────────────────────────
router.get('/teachers', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.school_id, u.is_suspended, u.is_approved, u.created_at,
             s.name AS school_name,
             COUNT(DISTINCT c.id)  AS class_count,
             COUNT(DISTINCT n.id)  AS notes_count,
             COUNT(DISTINCT h.id)  AS homework_count,
             COUNT(DISTINCT q.id)  AS quiz_count
      FROM users u
      LEFT JOIN schools s        ON u.school_id = s.id
      LEFT JOIN classes c        ON c.teacher_id = u.id
      LEFT JOIN notes n          ON n.class_id   = c.id
      LEFT JOIN homework h       ON h.class_id   = c.id
      LEFT JOIN quizzes q        ON q.class_id   = c.id
      WHERE u.role = 'teacher'
      GROUP BY u.id, s.name ORDER BY u.is_approved ASC, u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[admin/teachers]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/teachers/:id/suspend', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_suspended=$1 WHERE id=$2 AND role=\'teacher\' RETURNING id, name, is_suspended',
      [req.body.suspended, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Teacher not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/teachers/:id/approve', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET is_approved=TRUE WHERE id=$1 AND role='teacher' RETURNING id, name, email, is_approved",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Teacher not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/teachers/:id/school', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET school_id=$1 WHERE id=$2 AND role=\'teacher\' RETURNING id, name, school_id',
      [req.body.school_id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/teachers', ...adminOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const schoolId = parseInt(req.body.school_id, 10);
  const phone = String(req.body.phone || '').trim();
  const emailLocalPart = String(req.body.email_local_part || '').trim();
  const manualEmail = String(req.body.email || '').trim().toLowerCase();
  const autoGenerateEmail = req.body.auto_generate_email !== false;
  const manualPassword = String(req.body.password || '').trim();
  const isSchoolIT = req.body.is_school_it === true;

  if (!name) return res.status(400).json({ error: 'Teacher full name is required.' });
  if (!Number.isInteger(schoolId) || schoolId <= 0) return res.status(400).json({ error: 'Valid school_id is required.' });

  try {
    const schoolRes = await pool.query('SELECT id, name, email_domain FROM schools WHERE id=$1', [schoolId]);
    if (schoolRes.rows.length === 0) return res.status(404).json({ error: 'School not found.' });
    const school = schoolRes.rows[0];

    const created = await createTeacherAccount({
      schoolId,
      schoolName: school.name,
      schoolEmailDomain: school.email_domain,
      name,
      phone,
      emailLocalPart,
      manualEmail,
      autoGenerateEmail,
      manualPassword,
      isSchoolIT,
    });

    res.status(201).json(created);
  } catch (err) {
    const message = err?.message || 'Failed to create teacher account.';
    const status = /exists|required|allowed|configured/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/school/teachers', ...headTeacherOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const emailLocalPart = String(req.body.email_local_part || '').trim();
  const manualEmail = String(req.body.email || '').trim().toLowerCase();
  const autoGenerateEmail = req.body.auto_generate_email !== false;
  const manualPassword = String(req.body.password || '').trim();
  const isSchoolIT = req.body.is_school_it === true;

  if (!name) return res.status(400).json({ error: 'Teacher full name is required.' });

  try {
    const access = await getProvisionContext(req.user.id);
    if (!access || access.role !== 'head_teacher') {
      return res.status(403).json({ error: 'Only Head Teacher can create teacher accounts in school dashboard.' });
    }
    if (!access.schoolId) {
      return res.status(400).json({ error: 'Your account is not linked to a school.' });
    }

    const created = await createTeacherAccount({
      schoolId: access.schoolId,
      schoolName: access.schoolName,
      schoolEmailDomain: access.emailDomain,
      name,
      phone,
      emailLocalPart,
      manualEmail,
      autoGenerateEmail,
      manualPassword,
      isSchoolIT,
    });

    res.status(201).json(created);
  } catch (err) {
    const message = err?.message || 'Failed to create teacher account.';
    const status = /exists|required|allowed|configured/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

router.delete('/teachers/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1 AND role=\'teacher\'', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── STUDENTS ─────────────────────────────────────────────────────────────────
router.get('/students', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.is_suspended, u.created_at,
             s.name AS school_name,
             COUNT(DISTINCT cm.class_id) AS class_count
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN class_members cm ON cm.student_id = u.id
      WHERE u.role = 'student'
      GROUP BY u.id, s.name ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[admin/students]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/students/:id', ...adminOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Student name is required.' });
  if (name.length > 150) return res.status(400).json({ error: 'Student name is too long.' });

  try {
    const result = await pool.query(
      `UPDATE users
       SET name = $1
       WHERE id = $2 AND role = 'student'
       RETURNING id, name, email, phone, school_id`,
      [name, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[admin/students/:id PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/students', ...adminOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const schoolId = parseInt(req.body.school_id, 10);
  const phone = String(req.body.phone || '').trim();
  const emailLocalPart = String(req.body.email_local_part || '').trim();
  const manualEmail = String(req.body.email || '').trim().toLowerCase();
  const autoGenerateEmail = req.body.auto_generate_email !== false;
  const manualPassword = String(req.body.password || '').trim();

  if (!name) return res.status(400).json({ error: 'Student name is required.' });
  if (!Number.isInteger(schoolId) || schoolId <= 0) return res.status(400).json({ error: 'Valid school_id is required.' });

  try {
    const schoolRes = await pool.query('SELECT id, name, email_domain FROM schools WHERE id=$1', [schoolId]);
    if (schoolRes.rows.length === 0) return res.status(404).json({ error: 'School not found.' });
    const school = schoolRes.rows[0];

    const requiredDomain = resolveSchoolDomain(school.name, school.email_domain);
    let email = manualEmail;
    if (!email && autoGenerateEmail) {
      email = await generateUniqueStudentEmailWithLocal(pool, emailLocalPart || name, school);
    }
    if (!email) return res.status(400).json({ error: 'Email is required when auto generation is off.' });

    const manualDomain = emailDomainOf(email);
    if (manualEmail && manualDomain !== requiredDomain) {
      return res.status(403).json({ error: schoolEmailPolicyError(requiredDomain) });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already exists.' });

    const rawPassword = manualPassword || generateStrongPassword();
    const hashed = await bcrypt.hash(rawPassword, 12);

    const inserted = await pool.query(
      `INSERT INTO users (name, email, password, role, school_id, is_approved, phone)
       VALUES ($1,$2,$3,'student',$4,TRUE,$5)
       RETURNING id, name, email, role, school_id, phone, created_at`,
      [name, email, hashed, schoolId, phone || null]
    );

    res.status(201).json({
      student: inserted.rows[0],
      credentials: {
        email,
        password: rawPassword,
        generated_email: !manualEmail,
        generated_password: !manualPassword,
      },
    });
  } catch (err) {
    console.error('[admin/students POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/students/bulk-create', ...adminOnly, async (req, res) => {
  const schoolId = parseInt(req.body.school_id, 10);
  const namesFromArray = Array.isArray(req.body.students) ? req.body.students : [];
  const namesText = String(req.body.names_text || '');
  const defaultPassword = String(req.body.default_password || '').trim();
  const phone = String(req.body.phone || '').trim();

  const names = [
    ...namesFromArray.map((n) => String(n || '').trim()),
    ...namesText
      .split(/\r?\n|,/)
      .map((n) => String(n || '').trim()),
  ].filter(Boolean);

  if (!Number.isInteger(schoolId) || schoolId <= 0) return res.status(400).json({ error: 'Valid school_id is required.' });
  if (names.length === 0) return res.status(400).json({ error: 'Provide at least one student name.' });
  if (names.length > 300) return res.status(400).json({ error: 'Bulk create limit is 300 students per request.' });

  try {
    const schoolRes = await pool.query('SELECT id, name, email_domain FROM schools WHERE id=$1', [schoolId]);
    if (schoolRes.rows.length === 0) return res.status(404).json({ error: 'School not found.' });
    const school = schoolRes.rows[0];
    const requiredDomain = resolveSchoolDomain(school.name, school.email_domain);

    const created = [];
    const skipped = [];

    for (const studentName of names) {
      try {
        const email = await generateUniqueStudentEmail(pool, studentName, school);
        const rawPassword = defaultPassword || generateStrongPassword();
        const hashed = await bcrypt.hash(rawPassword, 12);

        const inserted = await pool.query(
          `INSERT INTO users (name, email, password, role, school_id, is_approved, phone)
           VALUES ($1,$2,$3,'student',$4,TRUE,$5)
           RETURNING id, name, email, role, school_id, created_at`,
          [studentName, email, hashed, schoolId, phone || null]
        );

        created.push({
          ...inserted.rows[0],
          password: rawPassword,
        });
      } catch (err) {
        skipped.push({ name: studentName, reason: err.message || 'Failed to create student.' });
      }
    }

    res.status(201).json({
      created_count: created.length,
      skipped_count: skipped.length,
      created,
      skipped,
    });
  } catch (err) {
    console.error('[admin/students/bulk-create POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/school/students', ...schoolProvisionAccess, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const emailLocalPart = String(req.body.email_local_part || '').trim();
  const manualEmail = String(req.body.email || '').trim().toLowerCase();
  const autoGenerateEmail = req.body.auto_generate_email !== false;
  const manualPassword = String(req.body.password || '').trim();

  if (!name) return res.status(400).json({ error: 'Student name is required.' });

  try {
    const access = await getProvisionContext(req.user.id);
    if (!access || !access.allowed) {
      return res.status(403).json({ error: 'Only Head Teacher or authorized School IT can create student accounts.' });
    }
    if (!access.schoolId) {
      return res.status(400).json({ error: 'Your account is not linked to a school.' });
    }
    const effectiveDomain = access.emailDomain || schoolDomainFromName(access.schoolName);
    const school = { id: access.schoolId, name: access.schoolName, email_domain: effectiveDomain };

    let email = manualEmail;
    if (!email && autoGenerateEmail) {
      email = await generateUniqueStudentEmailWithLocal(pool, emailLocalPart || name, school);
    }
    if (!email) return res.status(400).json({ error: 'Email is required when auto generation is off.' });

    const manualDomain = emailDomainOf(email);
    if (manualEmail && manualDomain !== effectiveDomain) {
      return res.status(403).json({ error: schoolEmailPolicyError(effectiveDomain) });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already exists.' });

    const rawPassword = manualPassword || generateStrongPassword();
    const hashed = await bcrypt.hash(rawPassword, 12);

    const inserted = await pool.query(
      `INSERT INTO users (name, email, password, role, school_id, is_approved, phone)
       VALUES ($1,$2,$3,'student',$4,TRUE,$5)
       RETURNING id, name, email, role, school_id, phone, created_at`,
      [name, email, hashed, access.schoolId, phone || null]
    );

    res.status(201).json({
      student: inserted.rows[0],
      credentials: {
        email,
        password: rawPassword,
        generated_email: !manualEmail,
        generated_password: !manualPassword,
      },
    });
  } catch (err) {
    console.error('[admin/school/students POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/school/teachers/:id/school-it', ...headTeacherOnly, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  const enabled = req.body.enabled === true;
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return res.status(400).json({ error: 'Valid teacher id is required.' });
  }

  try {
    const ht = await pool.query('SELECT school_id FROM users WHERE id=$1 AND role=\'head_teacher\' LIMIT 1', [req.user.id]);
    const schoolId = ht.rows[0]?.school_id;
    if (!schoolId) return res.status(400).json({ error: 'Head Teacher account is not linked to a school.' });

    const updated = await pool.query(
      `UPDATE users
          SET is_school_it = $1
        WHERE id = $2
          AND role = 'teacher'
          AND school_id = $3
      RETURNING id, name, email, is_school_it`,
      [enabled, teacherId, schoolId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found in your school.' });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[admin/school/teachers/:id/school-it PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/students/:id/suspend', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_suspended=$1 WHERE id=$2 AND role=\'student\' RETURNING id, name, is_suspended',
      [req.body.suspended, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/students/:id/reset-password', ...adminOnly, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    const hashed = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2 AND role=\'student\'', [hashed, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/students/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1 AND role=\'student\'', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── CLASSES ──────────────────────────────────────────────────────────────────
router.get('/classes', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.subject, c.class_code, c.created_at,
             u.name AS teacher_name,
             s.name AS school_name,
             COUNT(cm.student_id) AS student_count
      FROM classes c
      JOIN users u ON c.teacher_id = u.id
      LEFT JOIN schools s ON u.school_id = s.id
      LEFT JOIN class_members cm ON cm.class_id = c.id
      GROUP BY c.id, u.name, s.name ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/classes/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM classes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── CONTENT OVERVIEW ─────────────────────────────────────────────────────────
router.get('/content', ...adminOnly, async (req, res) => {
  try {
    const [notes, hw, quizzes] = await Promise.all([
      pool.query(`SELECT n.id, n.title, n.file_name, n.created_at, c.name AS class_name, u.name AS teacher_name
                  FROM notes n JOIN classes c ON n.class_id=c.id JOIN users u ON c.teacher_id=u.id ORDER BY n.created_at DESC LIMIT 50`),
      pool.query(`SELECT h.id, h.title, h.due_date, h.created_at, c.name AS class_name, u.name AS teacher_name
                  FROM homework h JOIN classes c ON h.class_id=c.id JOIN users u ON c.teacher_id=u.id ORDER BY h.created_at DESC LIMIT 50`),
      pool.query(`SELECT q.id, q.title, q.created_at, c.name AS class_name, u.name AS teacher_name,
                  COUNT(qa.id) AS attempt_count
                  FROM quizzes q JOIN classes c ON q.class_id=c.id JOIN users u ON c.teacher_id=u.id
                  LEFT JOIN quiz_attempts qa ON qa.quiz_id=q.id
                  GROUP BY q.id, c.name, u.name ORDER BY q.created_at DESC LIMIT 50`),
    ]);
    res.json({ notes: notes.rows, homework: hw.rows, quizzes: quizzes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/content/notes/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
router.get('/announcements', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name AS admin_name, s.name AS school_name
      FROM admin_announcements a
      JOIN users u ON a.admin_id = u.id
      LEFT JOIN schools s ON a.school_id = s.id
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/announcements', ...adminOnly, async (req, res) => {
  const { title, message, target, school_id } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required.' });
  try {
    const result = await pool.query(
      'INSERT INTO admin_announcements (admin_id, title, message, target, school_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, title, message, target || 'all', school_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/announcements/:id', ...adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM admin_announcements WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── REPORTS / MESSAGES ───────────────────────────────────────────────────────
router.get('/reports', ...adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM reports r JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/reports/:id/reply', ...adminOnly, async (req, res) => {
  const { reply } = req.body;
  if (!reply) return res.status(400).json({ error: 'Reply is required.' });
  try {
    const result = await pool.query(
      'UPDATE reports SET admin_reply=$1, status=\'resolved\', replied_at=NOW() WHERE id=$2 RETURNING *',
      [reply, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── STUDENT ARTICLE MODERATION ─────────────────────────────────────────────
router.get('/student-shares/pending-count', ...adminOnly, async (req, res) => {
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS count FROM student_shares WHERE status='pending'");
    res.json({ count: r.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/student-shares', ...adminOnly, async (req, res) => {
  const status = (req.query.status || 'pending').toString();
  if (!['pending', 'approved', 'declined', 'all'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const result = await pool.query(
      `SELECT s.id, s.type, s.content, s.status, s.school, s.class_name, s.teacher_name,
              s.created_at, s.review_note, s.reviewed_at,
              u.name AS student_name, u.email AS student_email,
              r.name AS reviewed_by_name
       FROM student_shares s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN users r ON r.id = s.reviewed_by
       WHERE ($1 = 'all' OR s.status = $1)
       ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'declined' THEN 1 ELSE 2 END,
                s.created_at DESC
       LIMIT 300`,
      [status]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/student-shares/:id/moderate', ...adminOnly, async (req, res) => {
  const decision = (req.body.decision || '').toString();
  const reviewNote = (req.body.review_note || '').toString().trim();
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved or declined.' });
  }
  if (decision === 'declined' && !reviewNote) {
    return res.status(400).json({ error: 'Decline reason is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE student_shares
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           review_note = CASE WHEN $1 = 'declined' THEN $3 ELSE NULL END
       WHERE id = $4
       RETURNING id, status, review_note, reviewed_at`,
      [decision, req.user.id, reviewNote || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Article not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── USER-FACING ANNOUNCEMENTS (any authenticated user) ──────────────────────
router.get('/user-announcements', authenticateToken, async (req, res) => {
  try {
    const roleTarget = req.user.role + 's'; // 'teacher' -> 'teachers', 'student' -> 'students'
    const result = await pool.query(`
      SELECT a.id, a.title, a.message, a.target, a.created_at, u.name AS admin_name
      FROM admin_announcements a
      JOIN users u ON a.admin_id = u.id
      WHERE a.target = 'all'
         OR a.target = $1
         OR (a.target = 'school' AND a.school_id = (SELECT school_id FROM users WHERE id = $2))
      ORDER BY a.created_at DESC
    `, [roleTarget, req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
router.get('/settings', ...adminOnly, async (req, res) => {
  try {
    let result = await pool.query('SELECT * FROM platform_settings LIMIT 1');
    if (result.rows.length === 0) {
      result = await pool.query('INSERT INTO platform_settings DEFAULT VALUES RETURNING *');
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/settings', ...adminOnly, async (req, res) => {
  const { platform_name, logo_url } = req.body;
  try {
    const result = await pool.query(
      'UPDATE platform_settings SET platform_name=$1, logo_url=$2, updated_at=NOW() RETURNING *',
      [platform_name, logo_url || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── NURSERY MEDIA (public feed + admin management) ─────────────────────────
router.get('/nursery-media/public', async (req, res) => {
  try {
    await ensureNurseryMediaTables();

    const settingsRes = await pool.query('SELECT * FROM nursery_media_settings LIMIT 1');
    const settings = settingsRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT *
       FROM nursery_media_items
       WHERE enabled = TRUE
       ORDER BY sort_order ASC, id ASC`
    );

    const allItems = itemsRes.rows;
    const songs = allItems.filter((x) => x.lesson_kind === 'song');
    const subjects = allItems.filter((x) => x.lesson_kind === 'subject');
    const audioSongs = songs.filter((x) => x.media_type === 'audio');
    const videoSubjects = subjects.filter((x) => x.media_type === 'video');

    const rotation = getRotationMeta(settings.interval_days, settings.rotation_anchor);
    const itemsPerGroup = Number(settings.items_per_group) || 2;

    const selectedAudio = rotateItems(audioSongs, rotation.windowIndex, itemsPerGroup);
    const selectedVideo = rotateItems(videoSubjects, rotation.windowIndex, itemsPerGroup);

    res.json({
      interval_days: settings.interval_days,
      items_per_group: settings.items_per_group,
      window_start: rotation.currentWindowStart,
      next_change_at: rotation.nextChangeAt,
      audio_lessons: selectedAudio.map((x) => ({
        id: x.id,
        title: x.title,
        subject: x.subject,
        src: x.media_url,
        lesson_kind: x.lesson_kind,
      })),
      video_lessons: selectedVideo.map((x) => ({
        id: x.id,
        title: x.title,
        subject: x.subject,
        src: x.media_url,
        lesson_kind: x.lesson_kind,
      })),
    });
  } catch (err) {
    console.error('[admin/nursery-media/public]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/nursery-media', ...adminOnly, async (req, res) => {
  try {
    await ensureNurseryMediaTables();
    const settingsRes = await pool.query('SELECT * FROM nursery_media_settings LIMIT 1');
    const itemsRes = await pool.query('SELECT * FROM nursery_media_items ORDER BY sort_order ASC, id ASC');
    res.json({ settings: settingsRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('[admin/nursery-media GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/nursery-media', ...adminOnly, async (req, res) => {
  const title = String(req.body.title || '').trim();
  const subject = String(req.body.subject || '').trim();
  const lessonKind = String(req.body.lesson_kind || '').trim();
  const mediaType = String(req.body.media_type || '').trim();
  const mediaUrl = String(req.body.media_url || '').trim();
  const enabled = req.body.enabled !== false;
  const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0;

  if (!title || !mediaUrl) return res.status(400).json({ error: 'title and media_url are required.' });
  if (!['song', 'subject'].includes(lessonKind)) return res.status(400).json({ error: 'lesson_kind must be song or subject.' });
  if (!['audio', 'video'].includes(mediaType)) return res.status(400).json({ error: 'media_type must be audio or video.' });

  try {
    await ensureNurseryMediaTables();
    const result = await pool.query(
      `INSERT INTO nursery_media_items (title, subject, lesson_kind, media_type, media_url, enabled, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [title, subject || null, lessonKind, mediaType, mediaUrl, enabled, sortOrder]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[admin/nursery-media POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/nursery-media/:id', ...adminOnly, async (req, res) => {
  const title = String(req.body.title || '').trim();
  const subject = String(req.body.subject || '').trim();
  const lessonKind = String(req.body.lesson_kind || '').trim();
  const mediaType = String(req.body.media_type || '').trim();
  const mediaUrl = String(req.body.media_url || '').trim();
  const enabled = req.body.enabled !== false;
  const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0;

  if (!title || !mediaUrl) return res.status(400).json({ error: 'title and media_url are required.' });
  if (!['song', 'subject'].includes(lessonKind)) return res.status(400).json({ error: 'lesson_kind must be song or subject.' });
  if (!['audio', 'video'].includes(mediaType)) return res.status(400).json({ error: 'media_type must be audio or video.' });

  try {
    await ensureNurseryMediaTables();
    const result = await pool.query(
      `UPDATE nursery_media_items
       SET title=$1,
           subject=$2,
           lesson_kind=$3,
           media_type=$4,
           media_url=$5,
           enabled=$6,
           sort_order=$7,
           updated_at=NOW()
       WHERE id=$8
       RETURNING *`,
      [title, subject || null, lessonKind, mediaType, mediaUrl, enabled, sortOrder, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Item not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[admin/nursery-media PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/nursery-media/:id', ...adminOnly, async (req, res) => {
  try {
    await ensureNurseryMediaTables();
    await pool.query('DELETE FROM nursery_media_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/nursery-media DELETE]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/nursery-media/settings', ...adminOnly, async (req, res) => {
  const intervalDays = Number(req.body.interval_days);
  const itemsPerGroup = Number(req.body.items_per_group);
  const resetCycle = req.body.reset_cycle === true;

  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 30) {
    return res.status(400).json({ error: 'interval_days must be an integer between 1 and 30.' });
  }
  if (!Number.isInteger(itemsPerGroup) || itemsPerGroup < 1 || itemsPerGroup > 10) {
    return res.status(400).json({ error: 'items_per_group must be an integer between 1 and 10.' });
  }

  try {
    await ensureNurseryMediaTables();
    const result = await pool.query(
      `UPDATE nursery_media_settings
       SET interval_days=$1,
           items_per_group=$2,
           rotation_anchor=CASE WHEN $3 THEN NOW() ELSE rotation_anchor END,
           updated_at=NOW()
       WHERE id = (SELECT id FROM nursery_media_settings ORDER BY id ASC LIMIT 1)
       RETURNING *`,
      [intervalDays, itemsPerGroup, resetCycle]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[admin/nursery-media/settings PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── SCHOOL BOARD (head teacher only) ───────────────────────────────────────
router.get('/my-school-board', ...schoolBoardAccess, async (req, res) => {
  try {
    await ensureCatBoardTables();

    const userRes = await pool.query('SELECT school_id FROM users WHERE id=$1', [req.user.id]);
    if (!userRes.rows[0]?.school_id) {
      return res.status(400).json({ error: 'Your account is not linked to a school yet.' });
    }
    const schoolId = userRes.rows[0].school_id;

    const schoolRes = await pool.query(
            `SELECT id, name, location, code, district, sector, cell, village,
              email_domain, student_count, head_teacher_name, head_teacher_phone,
              head_teacher_email, welcome_message, created_at
       FROM schools
       WHERE id = $1`,
      [schoolId]
    );
    if (schoolRes.rows.length === 0) return res.status(404).json({ error: 'School not found.' });

    const summaryRes = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher') AS teachers,
         (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'student') AS students,
         (SELECT COUNT(*)::int FROM classes c JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS classes,
         (SELECT COUNT(*)::int FROM notes n JOIN classes c ON c.id = n.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS notes,
         (SELECT COUNT(*)::int FROM homework h JOIN classes c ON c.id = h.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS homework,
         (SELECT COUNT(*)::int FROM quizzes q JOIN classes c ON c.id = q.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS quizzes,
         (SELECT COUNT(*)::int FROM cat_mark_sheets s JOIN classes c ON c.id = s.class_id JOIN users u ON u.id = c.teacher_id WHERE u.school_id = $1) AS cat_sheets,
         (SELECT COALESCE(ROUND(AVG(m.percentage)::numeric, 2), 0)::float AS value
            FROM cat_student_marks m
            JOIN cat_mark_sheets s ON s.id = m.sheet_id
            JOIN classes c ON c.id = s.class_id
            JOIN users u ON u.id = c.teacher_id
           WHERE u.school_id = $1) AS average_cat_percentage`,
      [schoolId]
    );

    const teachersRes = await pool.query(
      `SELECT u.id, u.name, u.email, u.is_approved, u.is_suspended, u.is_school_it,
              COUNT(DISTINCT c.id)::int AS classes_count,
              COUNT(DISTINCT n.id)::int AS notes_count,
              COUNT(DISTINCT h.id)::int AS homework_count,
              COUNT(DISTINCT q.id)::int AS quizzes_count,
              COUNT(DISTINCT cms.id)::int AS cat_sheets_count
       FROM users u
       LEFT JOIN classes c ON c.teacher_id = u.id
       LEFT JOIN notes n ON n.class_id = c.id
       LEFT JOIN homework h ON h.class_id = c.id
       LEFT JOIN quizzes q ON q.class_id = c.id
       LEFT JOIN cat_mark_sheets cms ON cms.class_id = c.id
       WHERE u.school_id = $1 AND u.role = 'teacher'
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 120`,
      [schoolId]
    );

    const classesRes = await pool.query(
      `SELECT c.id, c.name, c.subject, c.class_code, c.created_at,
              u.name AS teacher_name,
              COUNT(DISTINCT cm.student_id)::int AS students_count,
              COUNT(DISTINCT n.id)::int AS notes_count,
              COUNT(DISTINCT h.id)::int AS homework_count,
              COUNT(DISTINCT q.id)::int AS quizzes_count,
              COUNT(DISTINCT cms.id)::int AS cat_sheets_count,
              COALESCE(ROUND(AVG(csm.percentage)::numeric, 2), 0)::float AS cat_avg_percentage
       FROM classes c
       JOIN users u ON u.id = c.teacher_id
       LEFT JOIN class_members cm ON cm.class_id = c.id
       LEFT JOIN notes n ON n.class_id = c.id
       LEFT JOIN homework h ON h.class_id = c.id
       LEFT JOIN quizzes q ON q.class_id = c.id
       LEFT JOIN cat_mark_sheets cms ON cms.class_id = c.id
       LEFT JOIN cat_student_marks csm ON csm.sheet_id = cms.id
       WHERE u.school_id = $1
       GROUP BY c.id, u.name
       ORDER BY c.created_at DESC
       LIMIT 180`,
      [schoolId]
    );

    res.json({
      school: schoolRes.rows[0],
      summary: summaryRes.rows[0],
      teachers: teachersRes.rows,
      classes: classesRes.rows,
    });
  } catch (err) {
    console.error('[admin/my-school-board]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
