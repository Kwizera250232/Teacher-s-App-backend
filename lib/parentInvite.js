const crypto = require('crypto');
const pool = require('../db');
const { resolveFrontendUrl, buildParentInvitePath } = require('./frontendUrl');

async function getOrCreateParentInviteToken(studentId, creatorId) {
  const existing = await pool.query(
    `SELECT token FROM parent_invite_tokens
     WHERE student_id = $1 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [studentId]
  );
  if (existing.rows.length) {
    return existing.rows[0].token;
  }
  const token = crypto.randomBytes(22).toString('hex');
  await pool.query(
    `INSERT INTO parent_invite_tokens (token, student_id, creator_id) VALUES ($1,$2,$3)`,
    [token, studentId, creatorId || null]
  );
  return token;
}

async function buildParentInviteResponse(req, studentId, studentName) {
  const creatorId = req?.user?.id || null;
  const token = await getOrCreateParentInviteToken(studentId, creatorId);
  const base = resolveFrontendUrl(req);
  const path = buildParentInvitePath(token);
  return {
    invite_link: `${base}${path}`,
    token,
    student_name: studentName,
  };
}

module.exports = { getOrCreateParentInviteToken, buildParentInviteResponse };
