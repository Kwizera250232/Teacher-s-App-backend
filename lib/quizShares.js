const crypto = require('crypto');
const pool = require('../db');

const GUEST_EMAIL_DOMAIN = 'guest.umunsi.com';

async function ensureQuizShareSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_shares (
      id SERIAL PRIMARY KEY,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      sharer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_token VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_shares_token ON quiz_shares (share_token);
    CREATE INDEX IF NOT EXISTS idx_quiz_shares_quiz ON quiz_shares (quiz_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS guest_class_access (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      granted_via_quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, class_id)
    );
    CREATE INDEX IF NOT EXISTS idx_guest_class_access_user ON guest_class_access (user_id);

    ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('teacher', 'student', 'admin', 'head_teacher', 'parent', 'guest'));
  `).catch(() => {});
}

function newShareToken() {
  return crypto.randomBytes(24).toString('hex');
}

function frontendBase() {
  return (process.env.FRONTEND_URL || 'https://student.umunsi.com').replace(/\/$/, '');
}

function sharePageUrl(token) {
  return `${frontendBase()}/quiz/share/${encodeURIComponent(token)}`;
}

async function loadShareByToken(shareToken) {
  await ensureQuizShareSchema();
  const row = await pool.query(
    `SELECT qs.*, q.title AS quiz_title, q.description AS quiz_description,
            c.name AS class_name, c.subject AS class_subject,
            u.name AS teacher_name, u.school_id AS school_id
     FROM quiz_shares qs
     JOIN quizzes q ON q.id = qs.quiz_id
     JOIN classes c ON c.id = qs.class_id
     JOIN users u ON u.id = qs.sharer_id
     WHERE qs.share_token = $1
     LIMIT 1`,
    [shareToken]
  );
  return row.rows[0] || null;
}

async function grantGuestClassAccess(userId, classId, quizId) {
  await ensureQuizShareSchema();
  await pool.query(
    `INSERT INTO guest_class_access (user_id, class_id, granted_via_quiz_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, class_id) DO NOTHING`,
    [userId, classId, quizId || null]
  );
}

async function guestHasClassAccess(userId, classId) {
  await ensureQuizShareSchema();
  const r = await pool.query(
    'SELECT 1 FROM guest_class_access WHERE user_id=$1 AND class_id=$2 LIMIT 1',
    [userId, classId]
  );
  return r.rows.length > 0;
}

async function claimShareForUser(userId, shareToken) {
  const share = await loadShareByToken(shareToken);
  if (!share) return null;
  await grantGuestClassAccess(userId, share.class_id, share.quiz_id);
  return share;
}

module.exports = {
  GUEST_EMAIL_DOMAIN,
  ensureQuizShareSchema,
  newShareToken,
  sharePageUrl,
  frontendBase,
  loadShareByToken,
  grantGuestClassAccess,
  guestHasClassAccess,
  claimShareForUser,
};
