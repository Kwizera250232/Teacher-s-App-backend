const pool = require('../db');
const { insertUserNotification } = require('./classMomentNotify');
const { notifyTeacherPush } = require('./classContentNotify');
const { notifyParentsOfStudent } = require('./parentClassNotify');

async function getClassStaffUserIds(classId) {
  const cid = parseInt(classId, 10);
  if (!cid) return [];
  const ids = new Set();
  const cls = await pool.query('SELECT teacher_id FROM classes WHERE id = $1', [cid]);
  if (cls.rows[0]?.teacher_id) ids.add(cls.rows[0].teacher_id);
  const co = await pool.query(
    'SELECT teacher_id FROM class_co_teachers WHERE class_id = $1',
    [cid]
  );
  co.rows.forEach((r) => ids.add(r.teacher_id));
  return [...ids];
}

/** In-app + push for class owner and co-teachers. */
async function notifyClassStaffInApp({
  classId,
  type,
  title,
  body,
  payload = {},
  excludeUserId,
}) {
  const staffIds = await getClassStaffUserIds(classId);
  const exclude = excludeUserId ? parseInt(excludeUserId, 10) : null;
  let count = 0;
  for (const uid of staffIds) {
    if (exclude && uid === exclude) continue;
    await insertUserNotification({
      userId: uid,
      type,
      title,
      body,
      payload,
    });
    await notifyTeacherPush({
      teacherId: uid,
      title,
      body: body.slice(0, 500),
      url: payload.url,
      tag: payload.tag || type,
    }).catch(() => {});
    count += 1;
  }
  return count;
}

async function notifyTeachersGroupQuizSubmitted({
  classId,
  groupId,
  groupName,
  quizTitle,
  submitterName,
  score,
  total,
  assignmentId,
}) {
  const cid = parseInt(classId, 10);
  const title = `👥 Group quiz done — ${groupName || 'Team'}`;
  const body = `${submitterName} submitted “${quizTitle}” · ${score}/${total}`;
  const payload = {
    class_id: cid,
    group_id: groupId,
    assignment_id: assignmentId,
    url: `/teacher/classes/${cid}?tab=Quizzes`,
    tag: `group-quiz-${assignmentId}`,
  };
  return notifyClassStaffInApp({
    classId: cid,
    type: 'group_quiz_submitted',
    title,
    body,
    payload,
  });
}

async function notifyTeachersQuizSubmitted({
  classId,
  quizId,
  quizTitle,
  studentName,
  score,
  total,
}) {
  const cid = parseInt(classId, 10);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const title = `📝 Quiz submitted — ${studentName}`;
  const body = `“${quizTitle}” · ${score}/${total} (${pct}%)`;
  const payload = {
    class_id: cid,
    quiz_id: quizId,
    url: `/teacher/classes/${cid}?tab=Quizzes`,
    tag: `quiz-submit-${quizId}-${Date.now()}`,
  };
  return notifyClassStaffInApp({
    classId: cid,
    type: 'quiz_submitted',
    title,
    body,
    payload,
  });
}

async function notifyTeachersHomeworkSubmitted({
  classId,
  homeworkId,
  homeworkTitle,
  studentName,
}) {
  const cid = parseInt(classId, 10);
  const title = `📚 Homework in — ${studentName}`;
  const body = `Submitted “${homeworkTitle}”. Open Homework to grade.`;
  const payload = {
    class_id: cid,
    homework_id: homeworkId,
    url: `/teacher/classes/${cid}?tab=Homework`,
    tag: `hw-submit-${homeworkId}`,
  };
  return notifyClassStaffInApp({
    classId: cid,
    type: 'homework_submitted',
    title,
    body,
    payload,
  });
}

async function notifyParentsGroupQuizSubmitted({
  studentIds,
  classId,
  senderId,
  groupName,
  quizTitle,
  score,
  total,
}) {
  const unique = [...new Set((studentIds || []).map((id) => parseInt(id, 10)).filter(Boolean))];
  let sent = 0;
  for (const sid of unique) {
    const st = await pool.query('SELECT name FROM users WHERE id = $1', [sid]);
    const name = st.rows[0]?.name || 'Your child';
    const n = await notifyParentsOfStudent({
      studentId: sid,
      senderId,
      type: 'group_quiz_submitted',
      title: `${name}'s team finished a quiz`,
      body: `Team ${groupName}: “${quizTitle}” · ${score}/${total}`,
      payload: {
        class_id: parseInt(classId, 10),
        url: '/parent/dashboard?tab=child',
      },
    });
    sent += n;
  }
  return sent;
}

module.exports = {
  getClassStaffUserIds,
  notifyClassStaffInApp,
  notifyTeachersGroupQuizSubmitted,
  notifyTeachersQuizSubmitted,
  notifyTeachersHomeworkSubmitted,
  notifyParentsGroupQuizSubmitted,
};
