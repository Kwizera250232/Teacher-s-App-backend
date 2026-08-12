const { sendMail } = require('./optionalMailer');

async function maybeEmailParent({ parentEmail, subject, text, html, alsoEmail }) {
  if (!alsoEmail || !parentEmail) return { sent: false };
  return sendMail({ to: parentEmail, subject, text, html });
}

module.exports = { maybeEmailParent };
