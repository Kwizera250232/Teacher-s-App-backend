function schoolDomainFromName(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug ? `${slug}.edu` : null;
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
};
