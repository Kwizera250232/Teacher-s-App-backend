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

/** Link a logged-in parent to a student via invite token (signup or login). */
async function linkParentFromInviteToken(parentId, parentToken) {
  const token = String(parentToken || '').trim();
  if (!token) return { linked: false, reason: 'missing_token' };

  const inv = await pool.query(
    `SELECT pit.*, u.name AS student_name
     FROM parent_invite_tokens pit
     JOIN users u ON u.id = pit.student_id
     WHERE pit.token = $1 AND pit.used = FALSE AND pit.expires_at > NOW()
     LIMIT 1`,
    [token]
  );
  if (!inv.rows.length) {
    return { linked: false, reason: 'invalid_or_expired' };
  }
  const row = inv.rows[0];
  await pool.query(
    'INSERT INTO parent_children (parent_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [parentId, row.student_id]
  );
  await pool.query('UPDATE parent_invite_tokens SET used = TRUE WHERE id = $1', [row.id]);
  return {
    linked: true,
    student_id: row.student_id,
    student_name: row.student_name,
  };
}

module.exports = {
  getOrCreateParentInviteToken,
  buildParentInviteResponse,
  linkParentFromInviteToken,
};
