const { sendMail } = require('./optionalMailer');

async function maybeEmailParent({ parentEmail, subject, text, html, alsoEmail, attachments }) {
  if (!alsoEmail || !parentEmail) return { sent: false };
  return sendMail({ to: parentEmail, subject, text, html, attachments });
}

module.exports = { maybeEmailParent };
