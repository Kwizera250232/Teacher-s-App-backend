/** Role helpers for routing and UI labels */

export function isStaff(role) {
  return role === 'teacher' || role === 'head_teacher';
}

export function dashboardPath(role) {
  if (role === 'admin') return '/admin';
  if (role === 'head_teacher') return '/head-teacher/dashboard';
  if (role === 'teacher') return '/teacher/dashboard';
  if (role === 'parent') return '/parent/dashboard';
  if (role === 'student') return '/student/dashboard';
  if (role === 'guest') return '/guest/dashboard';
  return '/welcome';
}

export function staffBasePath(role) {
  return role === 'head_teacher' ? '/head-teacher' : '/teacher';
}

export function roleLabel(role) {
  const map = {
    admin: 'Admin',
    head_teacher: 'Head Teacher',
    teacher: 'Teacher',
    student: 'Student',
    parent: 'Parent',
    guest: 'Guest',
  };
  return map[role] || 'User';
}
