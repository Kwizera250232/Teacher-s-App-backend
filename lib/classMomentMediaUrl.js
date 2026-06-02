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

function pickOgImageUrl(moment, apiBase = apiPublicBase()) {
  const images = Array.isArray(moment?.images) ? moment.images : [];
  for (const img of images) {
    const fp = img?.file_path;
    if (!fp || VIDEO_EXT.test(fp)) continue;
    if (IMAGE_EXT.test(fp)) return absoluteUploadUrl(fp, apiBase);
  }
  return `${frontendBase()}/og-image.svg`;
}

function isImageMediaUrl(url) {
  return IMAGE_EXT.test(String(url || ''));
}

module.exports = {
  VIDEO_EXT,
  IMAGE_EXT,
  apiPublicBase,
  frontendBase,
  absoluteUploadUrl,
  pickOgImageUrl,
  isImageMediaUrl,
};
