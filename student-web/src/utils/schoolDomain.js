const MAIL_BASE = 'mail.umunsi.com';

/** Match backend lib/schoolDomain.js — slug from school name → schoolname.edu */
export function schoolDomainFromName(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug ? `${slug}.edu` : '';
}

/** Real mailbox domain when school mail is enabled (schoolslug.mail.umunsi.com). */
export function schoolMailDomainFromName(name, mailEnabled = true) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48);
  if (!slug) return '';
  return mailEnabled ? `${slug}.${MAIL_BASE}` : schoolDomainFromName(name);
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
