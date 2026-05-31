#!/usr/bin/env node
/**
 * Check whether an email is allowed and optionally whether the mailbox looks real.
 *
 * Usage:
 *   node scripts/check-email.js user@gmail.com
 *   node scripts/check-email.js teacher@schoolname.edu --school-domain schoolname.edu
 *   npm run check-email -- user@gmail.com
 */
require('dotenv').config();
const {
  isAllowedSignupEmail,
  checkMailboxExists,
} = require('../lib/emailValidate');

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const email = args[0];
  const schoolDomainFlag = process.argv.indexOf('--school-domain');
  const schoolDomain =
    schoolDomainFlag >= 0 ? process.argv[schoolDomainFlag + 1] : process.env.SCHOOL_DOMAIN || null;

  if (!email) {
    console.error('Usage: npm run check-email -- <email> [--school-domain example.edu]');
    process.exit(1);
  }

  const allowed = isAllowedSignupEmail(email, schoolDomain);
  console.log('Email:', email);
  console.log('Allowed type (Gmail or school):', allowed.ok ? allowed.type : 'NO');
  if (!allowed.ok) {
    console.log('Reason:', allowed.reason);
    process.exit(2);
  }

  console.log('Checking mailbox (SMTP RCPT, best-effort)…');
  const mailbox = await checkMailboxExists(email);
  console.log('Mailbox status:', mailbox.status);
  console.log('Detail:', mailbox.message);

  if (mailbox.status === 'not_exists') process.exit(3);
  if (mailbox.status === 'unknown') {
    console.log('Note: inconclusive — signup may still allow unless STRICT_EMAIL_VALIDATE=true');
    process.exit(0);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
