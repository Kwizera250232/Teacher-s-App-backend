const pool = require('../db');
const { insertUserNotification } = require('./classMomentNotify');

async function notifyGroupQuizReleased({
  classId,
  groupId,
  assignmentId,
  quizTitle,
  groupName,
  className,
}) {
  const members = await pool.query(
    'SELECT student_id FROM class_group_members WHERE group_id = $1',
    [groupId]
  );
  if (!members.rows.length) return { students: 0 };

  const title = '👥 Group quiz ready';
  const body = `${quizTitle} is ready for ${groupName}${className ? ` (${className})` : ''}. Open Groups to start.`;
  const payload = {
    type: 'group_quiz',
    class_id: classId,
    assignment_id: assignmentId,
    group_id: groupId,
    url: `/student/classes/${classId}?tab=Groups`,
  };

  for (const row of members.rows) {
    await insertUserNotification({
      userId: row.student_id,
      type: 'group_quiz',
      title,
      body,
      payload,
    });
  }

  return { students: members.rows.length };
}

module.exports = { notifyGroupQuizReleased };
