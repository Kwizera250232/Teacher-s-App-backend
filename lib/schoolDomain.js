function schoolDomainFromName(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug ? `${slug}.edu` : null;
}

/** True when domain is staff inbound mail (@slug.mail.umunsi.com), not student login. */
function isMailPlatformDomain(domain) {
  const d = String(domain || '').trim().toLowerCase().replace(/^@/, '');
  if (!d) return false;
  return d.includes('mail.umunsi.com');
}

/**
 * Login/signup domain for students and staff (@schoolname.edu).
 * Never returns mail.umunsi.com even if stored on the school row.
 */
function loginEmailDomainForSchool(school) {
  const stored = String(school?.email_domain || '').trim().toLowerCase().replace(/^@/, '');
  if (stored && !isMailPlatformDomain(stored)) {
    return stored;
  }
  return schoolDomainFromName(school?.name) || null;
}

/** Fix schools.email_domain when it was set to a mail.umunsi.com mailbox domain. */
async function persistLoginEmailDomain(pool, schoolRow) {
  const domain = loginEmailDomainForSchool(schoolRow);
  if (!schoolRow?.id || !domain) return domain;
  const stored = String(schoolRow.email_domain || '').trim().toLowerCase();
  if (!stored || isMailPlatformDomain(stored)) {
    await pool.query('UPDATE schools SET email_domain = $1 WHERE id = $2', [domain, schoolRow.id]);
    schoolRow.email_domain = domain;
  }
  return domain;
}

function normalizeLocalPart(local) {
  return String(local || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function buildSchoolEmail(local, domain) {
  const part = normalizeLocalPart(local);
  const dom = String(domain || '').trim().toLowerCase().replace(/^@/, '');
  if (!part || !dom || !dom.includes('.')) return null;
  return `${part}@${dom}`;
}

/**
 * Legacy platform domain — only used when STAFF_SIGNUP_EMAIL_DOMAIN is explicitly set.
 * Normal staff signup must use the school's domain (@schoolname.edu from code or school name).
 */
function getStaffSignupEmailDomain() {
  const raw = String(process.env.STAFF_SIGNUP_EMAIL_DOMAIN || '').trim().toLowerCase();
  if (!raw) return null;
  return raw.includes('.') ? raw : null;
}

module.exports = {
  schoolDomainFromName,
  normalizeLocalPart,
  buildSchoolEmail,
  getStaffSignupEmailDomain,
  isMailPlatformDomain,
  loginEmailDomainForSchool,
  persistLoginEmailDomain,
};
