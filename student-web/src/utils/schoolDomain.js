/** Match backend lib/schoolDomain.js — slug from school name → schoolname.edu */
export function schoolDomainFromName(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug ? `${slug}.edu` : '';
}

export function buildSchoolEmailPreview(local, domain) {
  const part = String(local || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
  const dom = String(domain || '').trim().toLowerCase().replace(/^@/, '');
  if (!part || !dom) return '';
  return `${part}@${dom}`;
}
