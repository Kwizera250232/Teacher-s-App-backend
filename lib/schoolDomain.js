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

module.exports = { schoolDomainFromName, normalizeLocalPart, buildSchoolEmail };
