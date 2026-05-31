const pool = require('../db');

async function canUsersMessage(userId, otherId, userRole) {
  if (userId === otherId) return false;
  if (userRole === 'admin') return true;

  const other = await pool.query('SELECT id, role, school_id FROM users WHERE id = $1', [otherId]);
  if (!other.rows.length) return false;
  const otherUser = other.rows[0];

  if (userRole === 'parent') {
    const staffRoles = ['teacher', 'head_teacher', 'admin'];
    if (!staffRoles.includes(otherUser.role)) {
      const link = await pool.query(
        `SELECT 1 FROM parent_children pc
         JOIN parent_children pc2 ON pc2.student_id = pc.student_id
         WHERE pc.parent_id = $1 AND pc2.parent_id = $2 LIMIT 1`,
        [userId, otherId]
      );
      return link.rows.length > 0;
    }
    const linked = await pool.query(
      `SELECT 1 FROM parent_children pc
       JOIN class_members cm ON cm.student_id = pc.student_id
       JOIN classes c ON c.id = cm.class_id
       WHERE pc.parent_id = $1 AND (
         c.teacher_id = $2
         OR EXISTS (SELECT 1 FROM class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = $2)
       )
       UNION
       SELECT 1 FROM parent_children pc
       JOIN users st ON st.id = pc.student_id
       JOIN users ht ON ht.school_id = st.school_id AND ht.role = 'head_teacher' AND ht.is_approved = TRUE
       WHERE pc.parent_id = $1 AND ht.id = $2
       LIMIT 1`,
      [userId, otherId]
    );
    return linked.rows.length > 0;
  }

  if (otherUser.role === 'parent') {
    const staffRoles = ['teacher', 'head_teacher', 'admin'];
    if (!staffRoles.includes(userRole)) return false;
    const senderRow = await pool.query('SELECT school_id FROM users WHERE id = $1', [userId]);
    const senderSchoolId = senderRow.rows[0]?.school_id || null;
    const linked = await pool.query(
      `SELECT 1 FROM parent_children pc
       JOIN class_members cm ON cm.student_id = pc.student_id
       JOIN classes c ON c.id = cm.class_id
       WHERE pc.parent_id = $2 AND (
         c.teacher_id = $1
         OR EXISTS (SELECT 1 FROM class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = $1)
         OR ($3 = 'head_teacher' AND $4 IS NOT NULL AND EXISTS (
           SELECT 1 FROM users st WHERE st.id = pc.student_id AND st.school_id = $4
         ))
       )
       LIMIT 1`,
      [userId, otherId, userRole, senderSchoolId]
    );
    return linked.rows.length > 0;
  }

  const shared = await pool.query(
    `SELECT 1 FROM class_members cm1
     JOIN class_members cm2 ON cm1.class_id = cm2.class_id
     WHERE cm1.student_id = $1 AND cm2.student_id = $2
     UNION
     SELECT 1 FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     WHERE (cm.student_id = $1 AND c.teacher_id = $2)
        OR (cm.student_id = $2 AND c.teacher_id = $1)
     LIMIT 1`,
    [userId, otherId]
  );
  return shared.rows.length > 0;
}

module.exports = { canUsersMessage };
