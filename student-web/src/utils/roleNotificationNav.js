import { classMomentDetailPath } from './classMomentPaths';
import { notificationIcon as studentNotificationIcon, studentNotificationPath } from './studentNotificationNav';

export { studentNotificationIcon as notificationIcon };

export function staffBasePath(role, basePath) {
  if (basePath) return basePath;
  return role === 'head_teacher' ? '/head-teacher' : '/teacher';
}

/** Resolve in-app path for teacher, parent, or student notification. */
export function roleNotificationPath(n, role, basePath) {
  const payload = n?.payload || {};
  if (payload.url) {
    return payload.url.startsWith('/') ? payload.url : `/${payload.url}`;
  }

  if (role === 'parent') {
    if (n.type === 'class_moment' && payload.moment_id) {
      return classMomentDetailPath('parent', payload.moment_id);
    }
    if (['quiz_result', 'group_quiz_submitted', 'homework_submitted'].includes(n.type)) {
      return '/parent/dashboard?tab=child';
    }
    return '/parent/dashboard?tab=school';
  }

  if (role === 'teacher' || role === 'head_teacher') {
    const bp = staffBasePath(role, basePath);
    const classId = payload.class_id;
    if (n.type === 'quiz_team_report' && classId) {
      const q = payload.report_id ? `&report=${payload.report_id}` : '';
      return `${bp}/classes/${classId}?tab=${encodeURIComponent('Quiz reports')}${q}`;
    }
    if (n.type === 'group_quiz_submitted' && classId) {
      return `${bp}/classes/${classId}?tab=Quizzes`;
    }
    if (n.type === 'quiz_submitted' && classId) {
      return `${bp}/classes/${classId}?tab=Quizzes`;
    }
    if (n.type === 'homework_submitted' && classId) {
      return `${bp}/classes/${classId}?tab=Homework`;
    }
    if (classId) return `${bp}/classes/${classId}`;
    return `${bp}/dashboard`;
  }

  return studentNotificationPath(n, role);
}
