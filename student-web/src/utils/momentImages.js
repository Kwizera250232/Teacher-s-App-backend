import { UPLOADS_BASE } from '../api';

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%234f46e5'/%3E%3Ctext y='.65em' font-size='42' x='50' text-anchor='middle' fill='white'%3E%F0%9F%93%B8%3C/text%3E%3C/svg%3E";

const VIDEO_EXT = /\.(mp4|mov|webm|3gp|m4v|mkv)(\?|$)/i;

export function isMomentVideo(filePath) {
  return VIDEO_EXT.test(String(filePath || ''));
}

export function momentImageUrl(filePath) {
  if (!filePath) return '';
  const raw = String(filePath);
  if (raw.startsWith('blob:') || raw.startsWith('http')) return raw;
  const clean = raw.replace(/^\/+/, '');
  return `${UPLOADS_BASE}/uploads/${clean}`;
}

export function teacherAvatarUrl(avatarPath) {
  if (!avatarPath) return DEFAULT_AVATAR;
  if (avatarPath.startsWith('http')) return avatarPath;
  return `${UPLOADS_BASE}/uploads/${String(avatarPath).replace(/^\/+/, '')}`;
}

export function formatMomentWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
