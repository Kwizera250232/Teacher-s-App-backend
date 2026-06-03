const VIDEO_EXT = /\.(mp4|mov|webm|3gp|m4v|mkv)(\?|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)(\?|$)/i;

function apiPublicBase() {
  return (process.env.API_PUBLIC_URL || 'https://studentapi.umunsi.com').replace(/\/$/, '');
}

function frontendBase() {
  return (process.env.FRONTEND_URL || 'https://student.umunsi.com').replace(/\/$/, '');
}

function absoluteUploadUrl(filePath, apiBase = apiPublicBase()) {
  if (!filePath) return null;
  const clean = String(filePath).replace(/^\/+/, '');
  return `${apiBase.replace(/\/$/, '')}/uploads/${clean}`;
}

function sortedMomentImages(moment) {
  const images = Array.isArray(moment?.images) ? [...moment.images] : [];
  return images.sort((a, b) => {
    const ao = Number(a?.sort_order) || 0;
    const bo = Number(b?.sort_order) || 0;
    if (ao !== bo) return ao - bo;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
}

/** First photo file_path in gallery order (skips videos). */
function pickFirstPhotoFilePath(moment) {
  for (const img of sortedMomentImages(moment)) {
    const fp = img?.file_path;
    if (!fp || VIDEO_EXT.test(fp)) continue;
    if (IMAGE_EXT.test(fp) || !VIDEO_EXT.test(fp)) return String(fp).replace(/^\/+/, '');
  }
  return null;
}

/** All photo URLs for a moment (for API + UI). */
function listMomentPhotoUrls(moment, apiBase = apiPublicBase()) {
  const out = [];
  for (const img of sortedMomentImages(moment)) {
    const fp = img?.file_path;
    if (!fp || VIDEO_EXT.test(fp)) continue;
    if (IMAGE_EXT.test(fp) || !VIDEO_EXT.test(fp)) {
      const url = absoluteUploadUrl(fp, apiBase);
      if (url) out.push(url);
    }
  }
  return out;
}

/** Public share link + OG image host (student.umunsi.com), not the API host. */
function sharePreviewImageUrl(shareToken, publicBase = frontendBase()) {
  const token = String(shareToken || '').trim();
  if (!token) return null;
  return `${publicBase.replace(/\/$/, '')}/share/moment/${encodeURIComponent(token)}/preview.jpg`;
}

function pickOgImageUrl(moment, publicBase = frontendBase(), shareToken = null) {
  if (shareToken && pickFirstPhotoFilePath(moment)) {
    return sharePreviewImageUrl(shareToken, publicBase);
  }
  return `${publicBase.replace(/\/$/, '')}/og-image.svg`;
}

function mimeTypeForPath(filePath) {
  const p = String(filePath || '').toLowerCase();
  if (/\.png(\?|$)/.test(p)) return 'image/png';
  if (/\.gif(\?|$)/.test(p)) return 'image/gif';
  if (/\.webp(\?|$)/.test(p)) return 'image/webp';
  return 'image/jpeg';
}

function isImageMediaUrl(url) {
  return IMAGE_EXT.test(String(url || '')) || /\/preview\.jpg/.test(String(url || ''));
}

module.exports = {
  VIDEO_EXT,
  IMAGE_EXT,
  apiPublicBase,
  frontendBase,
  absoluteUploadUrl,
  sortedMomentImages,
  pickFirstPhotoFilePath,
  listMomentPhotoUrls,
  sharePreviewImageUrl,
  pickOgImageUrl,
  mimeTypeForPath,
  isImageMediaUrl,
};
