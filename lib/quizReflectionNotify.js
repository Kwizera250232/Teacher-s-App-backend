const pool = require('../db');
const { insertUserNotification } = require('./classMomentNotify');
const { notifyTeacherPush } = require('./classContentNotify');

async function notifyTeacherQuizReflection({
  teacherId,
  classId,
  reportId,
  groupName,
  quizTitle,
  reporterName,
}) {
  const title = `📋 Team quiz report — ${groupName || 'your class'}`;
  const body = `${reporterName} shared how the team did on “${quizTitle}”. Tap to read and reply.`;
  const payload = {
    class_id: classId,
    report_id: reportId,
    url: `/teacher/classes/${classId}?tab=QuizReports&report=${reportId}`,
  };

  await insertUserNotification({
    userId: teacherId,
    type: 'quiz_team_report',
    title,
    body,
    payload,
  });

  await notifyTeacherPush({
    teacherId,
    title,
    body: body.slice(0, 500),
    url: payload.url,
    tag: `quiz-report-${reportId}`,
  }).catch(() => {});
}

async function notifyStudentTeacherReply({
  studentId,
  classId,
  reportId,
  quizTitle,
  teacherName,
}) {
  const title = `💬 Teacher replied on your quiz report`;
  const body = `${teacherName} commented on “${quizTitle}”. Open to read their message.`;
  const payload = {
    class_id: classId,
    report_id: reportId,
    url: `/student/quiz-reports?highlight=${reportId}`,
  };

  await insertUserNotification({
    userId: studentId,
    type: 'quiz_teacher_reply',
    title,
    body,
    payload,
  });
}

module.exports = { notifyTeacherQuizReflection, notifyStudentTeacherReply };
