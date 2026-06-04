const pool = require('../db');
const { sendMail } = require('./optionalMailer');
const { ensureClassMomentsSchema } = require('./classMomentsSchema');
const { notifyTeacherPush } = require('./classContentNotify');

function frontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'https://student.umunsi.com').replace(/\/$/, '');
}

async function insertTeacherNotification({ userId, title, body, payload }) {
  await ensureClassMomentsSchema();
  await pool.query(
    `INSERT INTO user_notifications (user_id, type, title, body, payload)
     VALUES ($1, 'quiz_teacher_share', $2, $3, $4)`,
    [userId, title.slice(0, 255), body.slice(0, 2000), payload || null]
  );
}

/**
 * In-app notification + optional email when a colleague shares a quiz.
 */
async function notifyQuizTeacherShare({
  shareId,
  recipientId,
  recipientEmail,
  recipientName,
  sharerName,
  quizTitle,
  sourceClassName,
  message,
}) {
  const dashboardUrl = `${frontendBaseUrl()}/teacher/dashboard`;
  const title = `Quiz invitation: ${quizTitle}`;
  const body = message
    ? `${sharerName} shared "${quizTitle}" from ${sourceClassName}. Message: ${message}`
    : `${sharerName} shared "${quizTitle}" from ${sourceClassName}. Open your dashboard to accept or decline.`;

  await insertTeacherNotification({
    userId: recipientId,
    title,
    body,
    payload: {
      share_id: shareId,
      url: dashboardUrl,
      quiz_title: quizTitle,
    },
  });

  await notifyTeacherPush({
    teacherId: recipientId,
    title,
    body: body.slice(0, 500),
    url: '/teacher/dashboard',
    tag: `quiz-share-${shareId}`,
  });

  const emailText = [
    `Hello${recipientName ? ` ${recipientName}` : ''},`,
    '',
    `${sharerName} invited you to use a quiz on UClass.`,
    '',
    `Quiz: ${quizTitle}`,
    `From class: ${sourceClassName}`,
    message ? `Message: ${message}` : '',
    '',
    'Log in and open your teacher dashboard → Classes tab to accept the quiz and choose which class should see it.',
    '',
    dashboardUrl,
    '',
    '— UClass',
  ]
    .filter(Boolean)
    .join('\n');

  const mailResult = await sendMail({
    to: recipientEmail,
    subject: `UClass: ${sharerName} shared a quiz with you`,
    text: emailText,
  });

  return { email_sent: mailResult.sent === true };
}

module.exports = {
  notifyQuizTeacherShare,
};
