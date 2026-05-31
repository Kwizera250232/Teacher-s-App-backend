import { UPLOADS_BASE } from '../api';

/** Public site URL for sharing (student.umunsi.com — not the API host). */
export function publicSiteBase() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  const env = import.meta.env.VITE_PUBLIC_URL || 'https://student.umunsi.com';
  return String(env).replace(/\/$/, '');
}

/** Direct link to a note or homework file (files live on studentapi.umunsi.com). */
export function documentShareUrl(kind, filePath) {
  if (!filePath) return null;
  const base = (UPLOADS_BASE || 'https://studentapi.umunsi.com').replace(/\/$/, '');
  const file = String(filePath).replace(/^\//, '');
  return `${base}/download/${kind}/${file}`;
}
/** Class page link when there is no file attachment */
export function classPageShareUrl(classId, tab, role = 'student') {
  const origin = publicSiteBase();
  const prefix = role === 'teacher' || role === 'head_teacher' ? '/teacher/classes' : '/student/classes';
  const tabQ = tab ? `?tab=${encodeURIComponent(tab)}` : '';
  return `${origin}${prefix}/${classId}${tabQ}`;
}

/**
 * Build payload for ShareModal — url is always the full document URL when a file exists.
 */
export function buildShareItem({
  title,
  description,
  fileKind,
  filePath,
  classId,
  tab,
  role = 'student',
}) {
  const docUrl = fileKind && filePath ? documentShareUrl(fileKind, filePath) : null;
  const url = docUrl || (classId ? classPageShareUrl(classId, tab, role) : (typeof window !== 'undefined' ? window.location.href : 'https://student.umunsi.com'));
  const label = description || title || 'UClass';
  return {
    title,
    url,
    text: docUrl ? `${label}\n\nOpen document:\n${docUrl}` : `${label}\n\n${url}`,
  };
}
