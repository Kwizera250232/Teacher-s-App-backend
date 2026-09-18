const jwt = require('jsonwebtoken');
const pool = require('../db');
const { ensureClassPaymentsSchema } = require('./classPaymentsSchema');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Paths students can always reach even when unpaid (relative to /api/classes mount,
// path here is like "/5/join" — sub-path after the class id)
const OPEN_SUBPATHS = /^\/(join|leave|payment-settings|my-access|pay|pay-status|subscribers)(\/|$)/;

/**
 * Payment gate for class content.
 * Mounted BEFORE the /api/classes routers so it intercepts student requests
 * to paid classes. Teachers/HT/admin/guests/alumni bypass; only 'student'
 * role is charged. Fails open on any error so existing features keep working.
 */
module.exports = async function classPaymentGate(req, res, next) {
  try {
    // Only care about /:numericId/... paths
    const m = req.path.match(/^\/(\d+)(\/.*)?$/);
    if (!m) return next();
    const classId = parseInt(m[1], 10);
    const sub = m[2] || '/';

    // Class info itself + payment endpoints are always open
    if (sub === '/' || OPEN_SUBPATHS.test(sub)) return next();

    // Decode JWT to get role (authenticateToken runs per-route later)
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return next(); // let downstream return 401
    let user;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      return next(); // invalid token → downstream 401
    }

    // Only students pay for class access
    if (user.role !== 'student') return next();

    await ensureClassPaymentsSchema();
    const settings = await pool.query(
      'SELECT enabled, amount_rwf FROM class_payment_settings WHERE class_id=$1',
      [classId]
    );
    const s = settings.rows[0];
    if (!s || !s.enabled || !(s.amount_rwf > 0)) return next();

    // Active subscription?
    const sub2 = await pool.query(
      `SELECT id FROM class_payments
       WHERE class_id=$1 AND student_id=$2 AND status='SUCCESSFUL' AND expires_at > NOW()
       LIMIT 1`,
      [classId, user.id]
    );
    if (sub2.rows.length) return next();

    return res.status(402).json({
      error: 'payment_required',
      code: 'PAYMENT_REQUIRED',
      class_id: classId,
      amount_rwf: s.amount_rwf,
    });
  } catch (err) {
    console.error('[classPaymentGate]', err.message);
    next(); // fail open
  }
};
