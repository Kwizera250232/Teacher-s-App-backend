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

const {
  pickOgImageUrl,
  listMomentPhotoUrls,
  apiPublicBase,
  frontendBase,
  sharePreviewImageUrl,
} = require('./classMomentMediaUrl');

function sharePreviewFromMoment(moment, mediaBaseUrl, shareToken = null) {
  const mediaBase = mediaBaseUrl || apiPublicBase();
  const publicBase = frontendBase();
  const photoUrls = listMomentPhotoUrls(moment, mediaBase);
  const imageUrl = pickOgImageUrl(moment, publicBase, shareToken);
  const title = `${moment.teacher_name || 'Teacher'} · ${moment.class_name || 'Class'}`;
  const text = String(moment.description || '').trim().slice(0, 280);
  const photoCount = photoUrls.length;
  const descWithPhoto =
    photoCount > 0
      ? `${text}${text ? ' — ' : ''}📸 ${photoCount === 1 ? '1 class photo' : `${photoCount} class photos`} (preview shows one)`
      : text;
  return {
    title,
    description: descWithPhoto,
    image_url: imageUrl,
    preview_images: photoUrls,
    preview_image_url: shareToken
      ? sharePreviewImageUrl(shareToken, publicBase)
      : photoUrls[0] || imageUrl,
    has_photo: photoCount > 0,
  };
}

module.exports = {
  ensureClassMomentSharesSchema,
  newShareToken,
  sharePreviewFromMoment,
};
