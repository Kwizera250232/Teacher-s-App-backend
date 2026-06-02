const pool = require('../db');
const { ensureClassMomentsSchema } = require('./classMomentsSchema');

async function notifyStaffTeacherPendingApproval({ teacherId, teacherName, schoolId }) {
  if (!schoolId || !teacherId) return;

  try {
    await ensureClassMomentsSchema();
  } catch (e) {
    console.error('[staffApprovalNotify] schema:', e.message);
  }

  const title = 'Umwarimu mushya';
  const body = `${teacherName || 'Umwarimu'} yiyandikishije. Emera konti ye mu gice cya School.`;
  const payload = JSON.stringify({ teacher_id: teacherId, school_id: schoolId });

  const staff = await pool.query(
    `SELECT id FROM users
     WHERE school_id = $1
       AND role IN ('head_teacher', 'admin')
       AND is_approved = TRUE
       AND COALESCE(is_suspended, FALSE) = FALSE`,
    [schoolId]
  );

  for (const row of staff.rows) {
    try {
      await pool.query(
        `INSERT INTO user_notifications (user_id, type, title, body, payload)
         VALUES ($1, 'teacher_pending_approval', $2, $3, $4::jsonb)`,
        [row.id, title, body.slice(0, 2000), payload]
      );
    } catch (e) {
      console.error('[staffApprovalNotify] insert:', e.message);
    }
  }
}

module.exports = { notifyStaffTeacherPendingApproval };
