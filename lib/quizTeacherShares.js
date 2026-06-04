const pool = require('../db');

async function ensureQuizTeacherShareSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_teacher_shares (
      id SERIAL PRIMARY KEY,
      source_quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      source_class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      source_teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      message TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT quiz_teacher_shares_status_check
        CHECK (status IN ('pending', 'accepted', 'declined'))
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_teacher_shares_recipient
      ON quiz_teacher_shares (recipient_teacher_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quiz_teacher_shares_target
      ON quiz_teacher_shares (target_class_id, status)
      WHERE target_class_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_teacher_shares_unique_active
      ON quiz_teacher_shares (source_quiz_id, recipient_teacher_id, target_class_id)
      WHERE status IN ('pending', 'accepted') AND target_class_id IS NOT NULL;
  `);
}

async function getTeacherSchoolId(userId) {
  const r = await pool.query(
    'SELECT school_id, role, is_approved FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  return r.rows[0] || null;
}

/** JWT may lack school_id — also infer from a class the teacher manages. */
async function resolveSharerSchoolId(userId, classIdOptional) {
  const userRow = await getTeacherSchoolId(userId);
  if (userRow?.school_id) return userRow.school_id;
  const classId = parseInt(classIdOptional, 10);
  if (!classId) return null;
  const r = await pool.query(
    `SELECT u.school_id
     FROM classes c
     JOIN users u ON u.id = c.teacher_id
     WHERE c.id = $1
     LIMIT 1`,
    [classId]
  );
  return r.rows[0]?.school_id || null;
}

async function findTeacherInAppByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const r = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.school_id, u.is_approved,
            p.avatar_path,
            (u.is_approved = TRUE AND u.school_id IS NOT NULL) AS is_verified
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE LOWER(u.email) = $1
       AND u.role IN ('teacher', 'head_teacher')
       AND COALESCE(u.is_suspended, FALSE) = FALSE
     LIMIT 1`,
    [normalized]
  );
  return r.rows[0] || null;
}

function teacherCanReceiveShare(teacher, sharerId, sharerSchoolId) {
  if (!teacher) return { ok: false, error: 'Teacher not found.' };
  if (teacher.id === sharerId) return { ok: false, error: 'You cannot share a quiz with yourself.' };
  if (!teacher.is_approved) {
    return { ok: false, error: `${teacher.name} is on UClass but not approved yet.` };
  }
  if (!sharerSchoolId) {
    return { ok: false, error: 'Join a school before sharing quizzes with colleagues.' };
  }
  if (!teacher.school_id) {
    return { ok: false, error: `${teacher.name} is on UClass but has not joined a school yet.` };
  }
  if (teacher.school_id !== sharerSchoolId) {
    return {
      ok: false,
      error: `${teacher.name} is on UClass at another school. They must join your school first.`,
    };
  }
  return { ok: true };
}

/** Same-school, approved staff only */
async function assertSameSchoolTeachers(sharerId, recipientId) {
  const [a, b] = await Promise.all([
    getTeacherSchoolId(sharerId),
    getTeacherSchoolId(recipientId),
  ]);
  if (!a || !b) return { ok: false, error: 'Teacher not found.' };
  if (!['teacher', 'head_teacher'].includes(a.role) || !['teacher', 'head_teacher'].includes(b.role)) {
    return { ok: false, error: 'Quiz can only be shared between teachers at your school.' };
  }
  if (!a.is_approved || !b.is_approved) {
    return { ok: false, error: 'Both teachers must be verified (approved) at your school.' };
  }
  if (!a.school_id || !b.school_id || a.school_id !== b.school_id) {
    return { ok: false, error: 'You can only share with teachers in the same school.' };
  }
  return { ok: true, school_id: a.school_id };
}

async function findAcceptedShareForClassQuiz(classId, quizId) {
  const r = await pool.query(
    `SELECT ts.*,
            st.name AS source_teacher_name,
            sc.name AS source_class_name,
            sc.subject AS source_class_subject,
            st.is_approved AS source_teacher_is_approved,
            st.school_id AS source_teacher_school_id
     FROM quiz_teacher_shares ts
     JOIN users st ON st.id = ts.source_teacher_id
     JOIN classes sc ON sc.id = ts.source_class_id
     WHERE ts.source_quiz_id = $1
       AND ts.target_class_id = $2
       AND ts.status = 'accepted'
     LIMIT 1`,
    [quizId, classId]
  );
  return r.rows[0] || null;
}

async function studentCanTakeSharedQuiz(studentId, classId, quizId) {
  const r = await pool.query(
    `SELECT 1
     FROM quiz_teacher_shares ts
     JOIN class_members cm ON cm.class_id = ts.target_class_id AND cm.student_id = $3
     WHERE ts.source_quiz_id = $1
       AND ts.target_class_id = $2
       AND ts.status = 'accepted'
     LIMIT 1`,
    [quizId, classId, studentId]
  );
  return r.rows.length > 0;
}

module.exports = {
  ensureQuizTeacherShareSchema,
  assertSameSchoolTeachers,
  findAcceptedShareForClassQuiz,
  studentCanTakeSharedQuiz,
  getTeacherSchoolId,
  resolveSharerSchoolId,
  findTeacherInAppByEmail,
  teacherCanReceiveShare,
};
