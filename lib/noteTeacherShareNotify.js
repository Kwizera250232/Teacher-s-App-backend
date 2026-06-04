const pool = require('../db');
const { ensureClassMomentsSchema } = require('./classMomentsSchema');
const { notifyTeacherPush } = require('./classContentNotify');

function frontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'https://student.umunsi.com').replace(/\/$/, '');
}

async function insertTeacherNotification({ userId, title, body, payload }) {
  await ensureClassMomentsSchema();
  await pool.query(
    `INSERT INTO user_notifications (user_id, type, title, body, payload)
     VALUES ($1, 'note_teacher_share', $2, $3, $4)`,
    [userId, title.slice(0, 255), body.slice(0, 2000), payload || null]
  );
}

async function notifyNoteTeacherShare({
  shareId,
  recipientId,
  sharerName,
  noteTitle,
  sourceClassName,
  message,
}) {
  const dashboardUrl = `${frontendBaseUrl()}/teacher/dashboard`;
  const title = `Note shared: ${noteTitle}`;
  const body = message
    ? `${sharerName} shared "${noteTitle}" from ${sourceClassName}. Message: ${message}`
    : `${sharerName} shared "${noteTitle}" from ${sourceClassName}. Open your dashboard to accept.`;

  await insertTeacherNotification({
    userId: recipientId,
    title,
    body,
    payload: {
      share_id: shareId,
      url: dashboardUrl,
      note_title: noteTitle,
    },
  });

  await notifyTeacherPush({
    teacherId: recipientId,
    title,
    body,
    url: '/teacher/dashboard',
    tag: `note-share-${shareId}`,
  });
}

module.exports = { notifyNoteTeacherShare };
