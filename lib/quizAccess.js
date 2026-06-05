const pool = require('../db');
const { guestHasClassAccess } = require('./quizShares');
const { studentCanTakeSharedQuiz } = require('./quizTeacherShares');

async function isClassMember(studentId, classId) {
  const r = await pool.query(
    'SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2 LIMIT 1',
    [classId, studentId]
  );
  return r.rows.length > 0;
}

async function quizInClass(quizId, classId) {
  const r = await pool.query(
    'SELECT 1 FROM quizzes WHERE id = $1 AND class_id = $2 LIMIT 1',
    [quizId, classId]
  );
  return r.rows.length > 0;
}

/** Throws-like return: { ok, status, error } */
async function canTakeQuiz(user, classId, quizId) {
  const cid = parseInt(classId, 10);
  const qid = parseInt(quizId, 10);
  if (!cid || !qid) {
    return { ok: false, status: 400, error: 'Invalid class or quiz.' };
  }
  const inClass = await quizInClass(qid, cid);
  if (!inClass) {
    if (user.role === 'student') {
      const shared = await studentCanTakeSharedQuiz(user.id, cid, qid);
      if (shared) return { ok: true, shared: true };
    }
    return { ok: false, status: 404, error: 'Quiz not found in this class.' };
  }
  if (user.role === 'student') {
    const member = await isClassMember(user.id, cid);
    if (!member) {
      return { ok: false, status: 403, error: 'You are not enrolled in this class.' };
    }
    const groupAssigned = await pool.query(
      `SELECT 1 FROM class_group_quiz_assignments
       WHERE class_id = $1 AND quiz_id = $2 LIMIT 1`,
      [cid, qid]
    );
    if (groupAssigned.rows.length) {
      return {
        ok: false,
        status: 403,
        error: 'This quiz is for your group only. Open the Groups tab, tap your team, then start the group quiz.',
      };
    }
    return { ok: true };
  }
  if (user.role === 'guest') {
    const access = await guestHasClassAccess(user.id, cid);
    if (!access) {
      return { ok: false, status: 403, error: 'Open the teacher’s shared quiz link first to get guest access.' };
    }
    return { ok: true };
  }
  return { ok: false, status: 403, error: 'Forbidden: insufficient role.' };
}

module.exports = { canTakeQuiz, isClassMember, quizInClass };
