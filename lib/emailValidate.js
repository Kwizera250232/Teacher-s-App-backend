const dns = require('dns').promises;
const net = require('net');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

const PARENT_PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'yopmail.com',
  'throwaway.email',
  'fakeinbox.com',
]);

function parseEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return null;
  const [local, domain] = normalized.split('@');
  return { local, domain, full: normalized };
}

function isGmailDomain(domain) {
  return GMAIL_DOMAINS.has(String(domain || '').toLowerCase());
}

function isSchoolDomainEmail(email, schoolDomain) {
  const parsed = parseEmail(email);
  if (!parsed || !schoolDomain) return false;
  const dom = String(schoolDomain).trim().toLowerCase().replace(/^@/, '');
  return parsed.domain === dom;
}

function isAllowedGmailOnlyEmail(email) {
  const parsed = parseEmail(email);
  if (!parsed) return { ok: false, reason: 'Invalid email format.' };
  if (DISPOSABLE_DOMAINS.has(parsed.domain)) {
    return { ok: false, reason: 'Disposable email addresses are not allowed.' };
  }
  if (isGmailDomain(parsed.domain)) {
    return { ok: true, type: 'gmail' };
  }
  return {
    ok: false,
    reason: 'Koresha aderesi ya Gmail gusa (urugero: amazina@gmail.com).',
  };
}

function isAllowedSignupEmail(email, schoolDomain) {
  const parsed = parseEmail(email);
  if (!parsed) return { ok: false, reason: 'Invalid email format.' };
  if (DISPOSABLE_DOMAINS.has(parsed.domain)) {
    return { ok: false, reason: 'Disposable email addresses are not allowed.' };
  }
  if (isGmailDomain(parsed.domain)) {
    return { ok: true, type: 'gmail' };
  }
  if (schoolDomain && parsed.domain === String(schoolDomain).toLowerCase().replace(/^@/, '')) {
    return { ok: true, type: 'school' };
  }
  return {
    ok: false,
    reason: 'Use a Gmail address or your school email (@' + (schoolDomain || 'school.edu') + ').',
  };
}

async function resolveMxHosts(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    return [];
  }
}

function smtpRcptCheck(mxHost, fromEmail, targetEmail, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let stage = 'connect';
    let buffer = '';
    const socket = net.createConnection(25, mxHost);
    const finish = (result) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish('unknown'), timeoutMs);

    const send = (line) => {
      socket.write(`${line}\r\n`);
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      const code = parseInt(last.slice(0, 3), 10);

      if (stage === 'connect' && code === 220) {
        stage = 'helo';
        send('HELO umunsi.com');
      } else if (stage === 'helo' && code >= 200 && code < 300) {
        stage = 'mailfrom';
        send(`MAIL FROM:<${fromEmail}>`);
      } else if (stage === 'mailfrom' && code >= 200 && code < 300) {
        stage = 'rcpt';
        send(`RCPT TO:<${targetEmail}>`);
      } else if (stage === 'rcpt') {
        clearTimeout(timer);
        if (code === 250 || code === 251) finish('exists');
        else if (code === 550 || code === 551 || code === 553) finish('not_exists');
        else finish('unknown');
        send('QUIT');
      }
    });

    socket.on('error', () => {
      clearTimeout(timer);
      finish('unknown');
    });
  });
}

/**
 * Best-effort mailbox check (Gmail and other domains with MX).
 * not_exists = treat as fake; unknown = cannot prove (allow if not STRICT).
 */
async function checkMailboxExists(email) {
  const parsed = parseEmail(email);
  if (!parsed) return { status: 'invalid', message: 'Invalid email format.' };

  const mxHosts = await resolveMxHosts(parsed.domain);
  if (!mxHosts.length) {
    return { status: 'not_exists', message: 'Domain has no mail servers (invalid).' };
  }

  const fromEmail = 'verify@umunsi.com';
  for (const host of mxHosts.slice(0, 2)) {
    const result = await smtpRcptCheck(host, fromEmail, parsed.full);
    if (result === 'exists') {
      return { status: 'exists', message: 'Mailbox appears to exist.' };
    }
    if (result === 'not_exists') {
      return { status: 'not_exists', message: 'Mailbox does not exist (rejected by server).' };
    }
  }

  return {
    status: 'unknown',
    message: 'Could not verify mailbox (server did not confirm).',
  };
}

function isAllowedParentEmail(email) {
  const parsed = parseEmail(email);
  if (!parsed) return { ok: false, reason: 'Invalid email format.' };
  if (DISPOSABLE_DOMAINS.has(parsed.domain)) {
    return { ok: false, reason: 'Disposable email addresses are not allowed.' };
  }
  if (PARENT_PERSONAL_DOMAINS.has(parsed.domain)) {
    return { ok: true, type: 'personal' };
  }
  return {
    ok: false,
    reason: 'Parents should use Gmail, Yahoo, Outlook, or a similar personal email.',
  };
}

function shouldSkipMailboxCheck(
  email,
  { role = null, skipMailbox = false, schoolDomain = null } = {}
) {
  if (skipMailbox || role === 'parent') return true;
  const parsed = parseEmail(email);
  if (!parsed) return true;
  // SMTP RCPT checks falsely reject many real Gmail/Yahoo/Outlook mailboxes.
  if (PARENT_PERSONAL_DOMAINS.has(parsed.domain)) return true;
  // UClass-issued @schooldomain addresses are login IDs, not hosted mailboxes.
  if (schoolDomain && isSchoolDomainEmail(email, schoolDomain)) return true;
  return false;
}

async function validateEmailForSignup(
  email,
  { schoolDomain, strict = false, role = null, skipMailbox = false, gmailOnly = false } = {}
) {
  const useGmailOnly =
    gmailOnly || ['student', 'teacher', 'head_teacher'].includes(role);
  const allowed = role === 'parent'
    ? isAllowedParentEmail(email)
    : useGmailOnly
      ? isAllowedGmailOnlyEmail(email)
      : isAllowedSignupEmail(email, schoolDomain);
  if (!allowed.ok) {
    return { valid: false, ...allowed };
  }

  if (shouldSkipMailboxCheck(email, { role, skipMailbox, schoolDomain })) {
    const schoolIssued =
      allowed.type === 'school' ||
      (schoolDomain && isSchoolDomainEmail(email, schoolDomain));
    return {
      valid: true,
      type: allowed.type,
      mailbox: {
        status: 'skipped',
        message: role === 'parent'
          ? 'Format check only for parent signup.'
          : schoolIssued
            ? 'UClass school email — login and in-app messaging only (no external mailbox check).'
            : 'Mailbox check skipped for this provider.',
      },
    };
  }

  const mailbox = await checkMailboxExists(email);
  if (mailbox.status === 'not_exists') {
    return { valid: false, reason: mailbox.message, mailbox };
  }
  if (strict && mailbox.status === 'unknown') {
    return { valid: false, reason: 'Could not verify this email is real. Try again later.', mailbox };
  }

  return { valid: true, type: allowed.type, mailbox };
}

module.exports = {
  parseEmail,
  isGmailDomain,
  isSchoolDomainEmail,
  isAllowedGmailOnlyEmail,
  isAllowedSignupEmail,
  isAllowedParentEmail,
  shouldSkipMailboxCheck,
  checkMailboxExists,
  validateEmailForSignup,
};
