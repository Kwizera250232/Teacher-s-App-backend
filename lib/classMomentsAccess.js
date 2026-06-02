const pool = require('../db');

async function classIdsForUser(user) {
  if (user.role === 'admin') {
    const r = await pool.query('SELECT id FROM classes');
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'student') {
    const r = await pool.query(
      'SELECT class_id AS id FROM class_members WHERE student_id = $1',
      [user.id]
    );
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'parent') {
    const r = await pool.query(
      `SELECT DISTINCT cm.class_id AS id
       FROM parent_children pc
       JOIN class_members cm ON cm.student_id = pc.student_id
       WHERE pc.parent_id = $1`,
      [user.id]
    );
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'teacher') {
    const r = await pool.query(
      `SELECT id FROM classes WHERE teacher_id = $1
       UNION SELECT class_id AS id FROM class_co_teachers WHERE teacher_id = $1`,
      [user.id]
    );
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'head_teacher' && user.school_id) {
    const r = await pool.query(
      `SELECT c.id FROM classes c
       JOIN users u ON u.id = c.teacher_id
       WHERE u.school_id = $1`,
      [user.school_id]
    );
    return r.rows.map((x) => x.id);
  }
  return [];
}

module.exports = { classIdsForUser };
