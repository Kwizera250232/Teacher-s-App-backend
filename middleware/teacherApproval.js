const jwt = require('jsonwebtoken');
const pool = require('../db');

const STAFF_APPROVAL_MESSAGE = 'Tegereza gato UCLASS Staff';

/** POST/PUT/PATCH/DELETE allowed while teacher account is pending HT approval. */
const PENDING_TEACHER_WRITE_ALLOW = [
  /^\/api\/auth\/me$/i,
  /^\/api\/auth\/forgot-password$/i,
  /^\/api\/auth\/reset-password/i,
  /^\/api\/auth\/reset-password-direct/i,
  /^\/api\/admin\/request-school$/i,
  /^\/api\/admin\/my-school-request$/i,
  /^\/api\/school\/request-school$/i,
  /^\/api\/school\/my-school-request$/i,
];

function requestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function isWriteMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

function writeAllowedWhilePending(path) {
  return PENDING_TEACHER_WRITE_ALLOW.some((re) => re.test(path));
}

/**
 * Blocks mutating API calls for teachers with is_approved=false.
 * Read-only access and school join request endpoints stay available.
 */
async function teacherApprovalGate(req, res, next) {
  if (!isWriteMethod(req.method)) return next();

  const path = requestPath(req);
  if (writeAllowedWhilePending(path)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next();
  }

  if (decoded.role !== 'teacher') return next();

  try {
    const row = await pool.query(
      'SELECT is_approved, is_suspended FROM users WHERE id = $1 LIMIT 1',
      [decoded.id]
    );
    const user = row.rows[0];
    if (!user || user.is_suspended) return next();
    if (user.is_approved !== false) return next();

    return res.status(403).json({
      error: STAFF_APPROVAL_MESSAGE,
      code: 'STAFF_APPROVAL_PENDING',
    });
  } catch (err) {
    console.error('[teacherApprovalGate]', err.message);
    return next();
  }
}

module.exports = {
  teacherApprovalGate,
  STAFF_APPROVAL_MESSAGE,
};
