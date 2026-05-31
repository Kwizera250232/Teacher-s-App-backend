const pool = require('../db');
const { buildParentInviteResponse } = require('./parentInvite');

/** Student (or staff on behalf of student) parent invite — shared by all API aliases. */
async function handleStudentParentInvite(req, res) {
  if (req.user.role !== 'student') {
    return res.status(403).json({
      error: 'Only students can create their own parent invite from this endpoint.',
    });
  }
  try {
    const row = await pool.query(
      `SELECT id, name FROM users WHERE id = $1 AND role = 'student'`,
      [req.user.id]
    );
    if (!row.rows.length) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    const payload = await buildParentInviteResponse(req, row.rows[0].id, row.rows[0].name);
    return res.json(payload);
  } catch (err) {
    console.error('[studentParentInvite]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { handleStudentParentInvite };
