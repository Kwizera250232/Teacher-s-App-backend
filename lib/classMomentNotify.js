const pool = require('../db');
const { insertParentNotification } = require('./parentHub');
const { sendPushToUser } = require('./pushNotify');

const TITLE_A = '📸 New Class Update';
const BODY_A = 'Your teacher has shared today\'s classroom activities. Tap to view.';
const TITLE_B = '📚 Today\'s Class Moments';
const BODY_B = 'New photos from today\'s lesson have been added.';

async function insertUserNotification({ userId, type, title, body, payload }) {
  await pool.query(
    `INSERT INTO user_notifications (user_id, type, title, body, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body.slice(0, 2000), payload || null]
  );

  const pushUrl = payload?.url || '/student/class-moments';
  sendPushToUser(userId, {
    title,
    body: body.slice(0, 500),
    url: pushUrl,
    tag: type ? `user-${type}` : 'user-alert',
  }).catch(() => {});
}

async function notifyClassMomentPublished({ momentId, classId, teacherId, className }) {
  const payload = {
    moment_id: momentId,
    class_id: classId,
    url: `/class-moments/${momentId}`,
  };

  const parents = await pool.query(
    `SELECT DISTINCT u.id AS parent_id, cm.student_id
     FROM class_members cm
     JOIN parent_children pc ON pc.student_id = cm.student_id
     JOIN users u ON u.id = pc.parent_id
     WHERE cm.class_id = $1`,
    [classId]
  );

  const students = await pool.query(
    `SELECT student_id FROM class_members WHERE class_id = $1`,
    [classId]
  );

  const useAlt = momentId % 2 === 0;
  const title = useAlt ? TITLE_B : TITLE_A;
  const body = useAlt ? BODY_B : BODY_A;

  for (const row of parents.rows) {
    await insertParentNotification({
      parentId: row.parent_id,
      studentId: row.student_id,
      senderId: teacherId,
      type: 'class_moment',
      title,
      body: className ? `${body} (${className})` : body,
      payload,
    });
  }

  for (const row of students.rows) {
    await insertUserNotification({
      userId: row.student_id,
      type: 'class_moment',
      title,
      body: className ? `${body} (${className})` : body,
      payload,
    });
  }

  return {
    parents: parents.rows.length,
    students: students.rows.length,
  };
}

module.exports = { notifyClassMomentPublished, insertUserNotification };
