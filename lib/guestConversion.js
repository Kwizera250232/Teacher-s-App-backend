const pool = require('../db');
const { schoolDomainFromName, normalizeLocalPart, buildSchoolEmail } = require('./schoolDomain');
const { validateEmailForSignup } = require('./emailValidate');

const STRICT_EMAIL = process.env.STRICT_EMAIL_VALIDATE === 'true';

async function convertGuestToTeacher(userId, { schoolEmailLocal, staffSchoolName }) {
  const local = normalizeLocalPart(schoolEmailLocal);
  const schoolName = String(staffSchoolName || '').trim();
  if (!local) throw Object.assign(new Error('Create your school email username.'), { status: 400 });
  if (!schoolName) throw Object.assign(new Error('Enter your school name for @schoolname.edu login.'), { status: 400 });

  const domain = schoolDomainFromName(schoolName);
  if (!domain) throw Object.assign(new Error('Invalid school name.'), { status: 400 });
  const email = buildSchoolEmail(local, domain);
  if (!email) throw Object.assign(new Error('Invalid school email username.'), { status: 400 });

  const taken = await pool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, userId]);
  if (taken.rows.length) throw Object.assign(new Error('That school email is already registered.'), { status: 409 });

  const userRes = await pool.query("SELECT id, name, role FROM users WHERE id = $1 AND role = 'guest'", [userId]);
  if (!userRes.rows.length) throw Object.assign(new Error('Guest account not found.'), { status: 404 });

  await pool.query(
    "UPDATE users SET role = 'teacher', email = $1, school_id = NULL, is_approved = TRUE WHERE id = $2",
    [email, userId]
  );
  await pool.query('DELETE FROM guest_class_access WHERE user_id = $1', [userId]);

  const updated = await pool.query(
    'SELECT id, name, email, role, school_id, is_approved FROM users WHERE id = $1',
    [userId]
  );
  return { user: updated.rows[0], login_email: email };
}

async function convertGuestToStudent(userId, { schoolEmailLocal, classCode, email: rawEmail }) {
  const code = String(classCode || '').trim().toUpperCase();
  if (!code) throw Object.assign(new Error('Class code is required.'), { status: 400 });

  const classRes = await pool.query(
    `SELECT c.id, c.name, c.class_code, u.school_id, s.name AS school_name, s.email_domain
     FROM classes c
     JOIN users u ON u.id = c.teacher_id
     LEFT JOIN schools s ON s.id = u.school_id
     WHERE c.class_code = $1`,
    [code]
  );
  if (!classRes.rows.length) {
    throw Object.assign(new Error('Invalid class code. Ask your teacher for the correct code.'), { status: 400 });
  }
  const cls = classRes.rows[0];

  let email = String(rawEmail || '').trim().toLowerCase();
  const local = normalizeLocalPart(schoolEmailLocal);
  if (!email && local) {
    const domain = cls.email_domain || schoolDomainFromName(cls.school_name || 'school');
    email = buildSchoolEmail(local, domain);
  }
  if (!email) throw Object.assign(new Error('Create your student login email.'), { status: 400 });

  const emailCheck = await validateEmailForSignup(email, {
    schoolDomain: cls.email_domain || schoolDomainFromName(cls.school_name || ''),
    strict: STRICT_EMAIL,
    role: 'student',
    skipMailbox: true,
  });
  if (!emailCheck.valid) throw Object.assign(new Error(emailCheck.reason), { status: 400 });

  const taken = await pool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, userId]);
  if (taken.rows.length) throw Object.assign(new Error('That email is already registered.'), { status: 409 });

  const userRes = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'guest'", [userId]);
  if (!userRes.rows.length) throw Object.assign(new Error('Guest account not found.'), { status: 404 });

  await pool.query(
    "UPDATE users SET role = 'student', email = $1, school_id = $2, is_approved = TRUE WHERE id = $3",
    [email, cls.school_id || null, userId]
  );
  await pool.query(
    'INSERT INTO class_members (class_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [cls.id, userId]
  );
  await pool.query('DELETE FROM guest_class_access WHERE user_id = $1', [userId]);

  const updated = await pool.query(
    'SELECT id, name, email, role, school_id, is_approved FROM users WHERE id = $1',
    [userId]
  );
  return {
    user: updated.rows[0],
    login_email: email,
    joined_class: { id: cls.id, name: cls.name, class_code: cls.class_code },
  };
}

module.exports = { convertGuestToTeacher, convertGuestToStudent };
