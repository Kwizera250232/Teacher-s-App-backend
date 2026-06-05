import { classMomentDetailPath } from './classMomentPaths';

const TYPE_ICONS = {
  group_quiz: '👥',
  group_points: '🏆',
  achievement_earned: '🏆',
  quiz_teacher_reply: '💬',
  quiz_team_report: '📋',
  class_quiz: '📝',
  class_homework: '📚',
  class_notes: '📄',
  class_announcement: '📢',
  class_feed: '💬',
  class_moment: '📸',
  shared_quiz: '📝',
  shared_note: '📄',
  share_approved: '✅',
  share_declined: '❌',
};

export function notificationIcon(type) {
  return TYPE_ICONS[type] || '🔔';
}

/** Resolve in-app navigation path for a student notification row. */
export function studentNotificationPath(n, role = 'student') {
  const payload = n?.payload || {};
  if (payload.url) return payload.url.startsWith('/') ? payload.url : `/${payload.url}`;
  if (n.type === 'class_moment' && payload.moment_id) {
    return classMomentDetailPath(role, payload.moment_id);
  }
  const classId = payload.class_id;
  if (!classId) return '/student/dashboard';

  const tabMap = {
    class_quiz: 'Quizzes',
    shared_quiz: 'Quizzes',
    class_homework: 'Homework',
    class_notes: 'Notes',
    shared_note: 'Notes',
    class_announcement: 'Announcements',
    class_feed: 'Feed',
    group_quiz: 'Groups',
    group_points: 'Groups',
    achievement_earned: 'Groups',
    quiz_teacher_reply: null,
  };
  if (n.type === 'quiz_teacher_reply' && payload.report_id) {
    return `/student/quiz-reports?highlight=${payload.report_id}`;
  }
  const tab = tabMap[n.type];
  const groupId = payload.group_id;
  if (tab === 'Groups' && groupId) {
    return `/student/classes/${classId}?tab=Groups&group=${groupId}`;
  }
  return tab ? `/student/classes/${classId}?tab=${encodeURIComponent(tab)}` : `/student/classes/${classId}`;
}
