const pool = require('../db');
const { sendPushToUser } = require('./pushNotify');

function studentClassUrl(classId) {
  return `/student/classes/${classId}`;
}

function teacherClassUrl(classId) {
  return `/teacher/classes/${classId}`;
}

function parentDashboardUrl() {
  return '/parent/dashboard';
}

/** Push alert to students in a class and their linked parents when new content is uploaded. */
async function notifyClassAudiencePush({
  classId,
  excludeUserId,
  title,
  body,
  tag,
  contentType,
}) {
  const cid = parseInt(classId, 10);
  if (!cid || !title) return { students: 0, parents: 0 };

  const classRow = await pool.query('SELECT name FROM classes WHERE id = $1', [cid]);
  const className = classRow.rows[0]?.name || 'Your class';
  const fullBody = body || `New ${contentType || 'update'} in ${className}.`;
  const pushTag = tag || `class-${cid}-${contentType || 'update'}`;

  const students = await pool.query(
    `SELECT cm.student_id AS user_id
     FROM class_members cm
     WHERE cm.class_id = $1`,
    [cid]
  );

  const parents = await pool.query(
    `SELECT DISTINCT pc.parent_id AS user_id
     FROM class_members cm
     JOIN parent_children pc ON pc.student_id = cm.student_id
     WHERE cm.class_id = $1`,
    [cid]
  );

  let studentCount = 0;
  let parentCount = 0;
  const exclude = excludeUserId ? parseInt(excludeUserId, 10) : null;

  for (const row of students.rows) {
    if (exclude && row.user_id === exclude) continue;
    await sendPushToUser(row.user_id, {
      title,
      body: fullBody,
      url: studentClassUrl(cid),
      tag: pushTag,
    });
    studentCount += 1;
  }

  for (const row of parents.rows) {
    if (exclude && row.user_id === exclude) continue;
    await sendPushToUser(row.user_id, {
      title,
      body: fullBody,
      url: parentDashboardUrl(),
      tag: pushTag,
    });
    parentCount += 1;
  }

  return { students: studentCount, parents: parentCount };
}

/** Push to a single teacher (e.g. colleague share). */
async function notifyTeacherPush({ teacherId, title, body, url, tag }) {
  const tid = parseInt(teacherId, 10);
  if (!tid) return;
  await sendPushToUser(tid, {
    title,
    body,
    url: url || '/teacher/dashboard',
    tag: tag || 'teacher-alert',
  });
}

module.exports = {
  notifyClassAudiencePush,
  notifyTeacherPush,
  studentClassUrl,
  teacherClassUrl,
};
