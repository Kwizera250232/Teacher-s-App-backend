/** Role-aware routes for Today's Class Moments */

export function classMomentsFeedPath(role) {
  if (role === 'parent') return '/parent/class-moments';
  if (role === 'student') return '/student/class-moments';
  if (role === 'head_teacher') return '/head-teacher/class-moments';
  if (role === 'teacher') return '/teacher/class-moments';
  return '/student/class-moments';
}

export function classMomentDetailPath(role, momentId) {
  return `${classMomentsFeedPath(role)}/${momentId}`;
}
