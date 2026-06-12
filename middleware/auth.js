const jwt = require('jsonwebtoken');
const { enrichUserFromDb } = require('../lib/enrichUser');
require('dotenv').config();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = await enrichUserFromDb(user);

    // Email confirmation gate: unconfirmed HT/Teacher/Guest can explore (GET)
    // but cannot create or change anything until they confirm their email.
    if (
      req.user?.email_confirmed === false &&
      ['head_teacher', 'teacher', 'guest'].includes(req.user.role) &&
      req.method !== 'GET' &&
      !String(req.originalUrl || '').includes('/auth/resend-confirmation')
    ) {
      return res.status(403).json({
        error:
          'Emeza imeyili yawe mbere — please confirm your email first. Check your inbox for the UClass confirmation link (or resend it from the banner).',
        code: 'EMAIL_NOT_CONFIRMED',
      });
    }
    next();
  });
}

function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    const role = req.user.role;
    if (allowed.includes('teacher') && role === 'head_teacher') {
      return next();
    }
    if (!allowed.includes(role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role.' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
