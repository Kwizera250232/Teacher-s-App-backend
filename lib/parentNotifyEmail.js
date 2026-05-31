const { sendMail } = require('./optionalMailer');

async function maybeEmailParent({ parentEmail, subject, text, alsoEmail }) {
  if (!alsoEmail || !parentEmail) return { sent: false };
  return sendMail({ to: parentEmail, subject, text });
}

module.exports = { maybeEmailParent };
