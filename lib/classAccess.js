const pool = require('../db');

async function getClassRow(classId) {
  const result = await pool.query(
    `SELECT c.*, u.school_id AS teacher_school_id
     FROM classes c
     JOIN users u ON c.teacher_id = u.id
     WHERE c.id = $1`,
    [classId]
  );
  return result.rows[0] || null;
}

async function isCoTeacher(classId, userId) {
  const r = await pool.query(
    'SELECT 1 FROM class_co_teachers WHERE class_id=$1 AND teacher_id=$2',
    [classId, userId]
  );
  return r.rows.length > 0;
}

async function isClassMember(classId, studentId) {
  const r = await pool.query(
    'SELECT 1 FROM class_members WHERE class_id=$1 AND student_id=$2',
    [classId, studentId]
  );
  return r.rows.length > 0;
}

async function isParentOfStudentInClass(parentId, classId) {
  const r = await pool.query(
    `SELECT 1 FROM parent_children pc
     JOIN class_members cm ON cm.student_id = pc.student_id
     WHERE pc.parent_id = $1 AND cm.class_id = $2`,
    [parentId, classId]
  );
  return r.rows.length > 0;
}

/** Returns true if user may view/manage class (varies by action elsewhere) */
async function userCanAccessClass(user, classId) {
  const cls = await getClassRow(classId);
  if (!cls) return { ok: false, cls: null };

  if (user.role === 'admin') return { ok: true, cls };
  if (user.role === 'teacher' && cls.teacher_id === user.id) return { ok: true, cls };
  if (user.role === 'teacher' && (await isCoTeacher(classId, user.id))) return { ok: true, cls };
  if (user.role === 'head_teacher' && user.school_id && cls.teacher_school_id === user.school_id) {
    return { ok: true, cls };
  }
  if (user.role === 'student' && (await isClassMember(classId, user.id))) return { ok: true, cls };
  if (user.role === 'parent' && (await isParentOfStudentInClass(user.id, classId))) {
    return { ok: true, cls };
  }
  return { ok: false, cls };
}

async function userCanManageClass(user, classId) {
  const cls = await getClassRow(classId);
  if (!cls) return { ok: false, cls: null };
  if (user.role === 'admin') return { ok: true, cls };
  if (user.role === 'teacher' && cls.teacher_id === user.id) return { ok: true, cls };
  if (user.role === 'teacher' && (await isCoTeacher(classId, user.id))) return { ok: true, cls };
  if (user.role === 'head_teacher' && user.school_id && cls.teacher_school_id === user.school_id) {
    return { ok: true, cls };
  }
  return { ok: false, cls: null };
}

/** Teacher/HT may create parent invites for students in classes they manage */
async function userCanInviteParentForStudent(user, studentId) {
  const memberClasses = await pool.query(
    'SELECT class_id FROM class_members WHERE student_id = $1',
    [studentId]
  );
  for (const row of memberClasses.rows) {
    const manage = await userCanManageClass(user, row.class_id);
    if (manage.ok) return true;
  }
  return false;
}

module.exports = {
  getClassRow,
  isCoTeacher,
  isClassMember,
  isParentOfStudentInClass,
  userCanAccessClass,
  userCanManageClass,
  userCanInviteParentForStudent,
};
