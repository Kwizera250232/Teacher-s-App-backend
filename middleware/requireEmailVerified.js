const pool = require('../db');

async function requireEmailVerified(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT email_verified FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'User not found.' });
    }
    if (result.rows[0].email_verified) {
      return next();
    }
    return res.status(403).json({
      error: 'Please confirm your email before using this feature.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  } catch (err) {
    console.error('[requireEmailVerified]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = { requireEmailVerified };
