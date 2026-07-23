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

    next();
  });
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      req.user = null;
      return next();
    }
    req.user = await enrichUserFromDb(user);
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

module.exports = { authenticateToken, optionalAuth, requireRole };
