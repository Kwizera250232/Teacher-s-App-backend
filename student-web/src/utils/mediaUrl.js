import { UPLOADS_BASE } from '../api';

/** Media files are stored on the API server (studentapi.umunsi.com). */
export function resolveMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const base = (UPLOADS_BASE || 'https://studentapi.umunsi.com').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
