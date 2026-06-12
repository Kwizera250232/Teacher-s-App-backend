const pool = require('../db');

/** Attach school_id and flags from DB (JWT only has id + role). */
async function enrichUserFromDb(user) {
  if (!user?.id) return user;
  try {
    const r = await pool.query(
      'SELECT school_id, is_approved, is_suspended, email_confirmed FROM users WHERE id = $1',
      [user.id]
    );
    if (!r.rows.length) return user;
    const row = r.rows[0];
    return {
      ...user,
      school_id: row.school_id,
      is_approved: row.is_approved,
      is_suspended: row.is_suspended,
      email_confirmed: row.email_confirmed,
    };
  } catch {
    return user;
  }
}

module.exports = { enrichUserFromDb };
