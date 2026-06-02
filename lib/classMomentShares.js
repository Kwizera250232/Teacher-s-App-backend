const crypto = require('crypto');
const pool = require('../db');

async function ensureClassMomentSharesSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_moment_shares (
      id SERIAL PRIMARY KEY,
      moment_id INTEGER NOT NULL REFERENCES class_moments(id) ON DELETE CASCADE,
      sharer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_token VARCHAR(64) NOT NULL UNIQUE,
      channel VARCHAR(40) NOT NULL DEFAULT 'social',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_class_moment_shares_moment
      ON class_moment_shares (moment_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_class_moment_shares_token
      ON class_moment_shares (share_token);
  `);
}

function newShareToken() {
  return crypto.randomBytes(24).toString('hex');
}

const { pickOgImageUrl } = require('./classMomentMediaUrl');

function sharePreviewFromMoment(moment, baseUrl) {
  const imageUrl = pickOgImageUrl(moment, baseUrl);
  const title = `${moment.teacher_name || 'Teacher'} · ${moment.class_name || 'Class'}`;
  const text = String(moment.description || '').trim().slice(0, 280);
  return { title, description: text, image_url: imageUrl };
}

module.exports = {
  ensureClassMomentSharesSchema,
  newShareToken,
  sharePreviewFromMoment,
};
