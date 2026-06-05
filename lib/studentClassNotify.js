const pool = require('../db');
const { insertUserNotification } = require('./classMomentNotify');
const { ensureClassMomentsSchema } = require('./classMomentsSchema');

function studentClassUrl(classId, tab) {
  const base = `/student/classes/${classId}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

function tabFromContentType(contentType) {
  const map = {
    quiz: 'Quizzes',
    homework: 'Homework',
    notes: 'Notes',
    announcement: 'Announcements',
    feed: 'Feed',
  };
  return map[contentType] || null;
}

function typeFromContentType(contentType) {
  const map = {
    quiz: 'class_quiz',
    homework: 'class_homework',
    notes: 'class_notes',
    announcement: 'class_announcement',
    feed: 'class_feed',
  };
  return map[contentType] || 'class_update';
}

/** In-app notification (+ web push) for every student in a class. */
async function notifyClassStudentsInApp({
  classId,
  excludeUserId,
  type,
  title,
  body,
  tab,
  contentType,
  extraPayload = {},
}) {
  const cid = parseInt(classId, 10);
  if (!cid || !title) return { students: 0 };

  await ensureClassMomentsSchema();

  const resolvedTab = tab || tabFromContentType(contentType);
  const resolvedType = type || typeFromContentType(contentType);
  const students = await pool.query(
    `SELECT cm.student_id AS user_id FROM class_members cm WHERE cm.class_id = $1`,
    [cid]
  );
  const exclude = excludeUserId ? parseInt(excludeUserId, 10) : null;
  const payload = {
    class_id: cid,
    url: studentClassUrl(cid, resolvedTab),
    content_type: contentType || null,
    ...extraPayload,
  };

  let count = 0;
  for (const row of students.rows) {
    if (exclude && row.user_id === exclude) continue;
    await insertUserNotification({
      userId: row.user_id,
      type: resolvedType,
      title,
      body,
      payload,
    });
    count += 1;
  }
  return { students: count };
}

module.exports = {
  notifyClassStudentsInApp,
  studentClassUrl,
  tabFromContentType,
  typeFromContentType,
};
