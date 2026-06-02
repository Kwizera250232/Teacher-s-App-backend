const pool = require('../db');
const { classIdsForUser } = require('./classMomentsAccess');

async function resolveSchoolIdForUser(user) {
  if (user.school_id) return user.school_id;
  if (user.role === 'student') {
    const r = await pool.query(
      `SELECT DISTINCT u.school_id
       FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE cm.student_id = $1 AND u.school_id IS NOT NULL
       LIMIT 1`,
      [user.id]
    );
    return r.rows[0]?.school_id || null;
  }
  if (user.role === 'parent') {
    const r = await pool.query(
      `SELECT DISTINCT u.school_id
       FROM parent_children pc
       JOIN class_members cm ON cm.student_id = pc.student_id
       JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE pc.parent_id = $1 AND u.school_id IS NOT NULL
       LIMIT 1`,
      [user.id]
    );
    return r.rows[0]?.school_id || null;
  }
  if (user.role === 'teacher' || user.role === 'head_teacher') {
    const r = await pool.query('SELECT school_id FROM users WHERE id = $1', [user.id]);
    return r.rows[0]?.school_id || null;
  }
  return null;
}

/** Moments from other classes in the same school (not in the user's normal feed). */
async function discoverMomentsForUser(user, limit = 30) {
  const schoolId = await resolveSchoolIdForUser(user);
  if (!schoolId) return { school_id: null, items: [] };

  const myClassIds = await classIdsForUser(user);
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 60);
  const htSchoolBrowse = user.role === 'head_teacher' && user.school_id;

  let sql = `
    SELECT m.*,
           u.name AS teacher_name,
           p.avatar_path AS teacher_avatar_path,
           c.name AS class_name,
           COALESCE(
             (SELECT json_agg(json_build_object(
               'id', i.id,
               'file_path', i.file_path,
               'sort_order', i.sort_order
             ) ORDER BY i.sort_order, i.id)
              FROM class_moment_images i WHERE i.moment_id = m.id),
             '[]'::json
           ) AS images
    FROM class_moments m
    JOIN classes c ON c.id = m.class_id
    JOIN users u ON u.id = m.teacher_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.school_id = $1
  `;
  const params = [schoolId];

  if (!htSchoolBrowse && myClassIds.length) {
    sql += ` AND NOT (m.class_id = ANY($2::int[]))`;
    params.push(myClassIds);
  }

  sql += ` ORDER BY m.published_at DESC LIMIT ${cap}`;
  const rows = await pool.query(sql, params);
  return { school_id: schoolId, items: rows.rows };
}

module.exports = { resolveSchoolIdForUser, discoverMomentsForUser };
