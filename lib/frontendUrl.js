/** Base URL for invite links (no trailing slash). */
function resolveFrontendUrl(req) {
  const configured = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  const origin = req?.get?.('origin');
  if (origin) {
    try {
      const u = new URL(origin);
      if (isAllowedFrontendHost(u.hostname)) return u.origin;
    } catch {
      /* ignore */
    }
  }
  const referer = req?.get?.('referer');
  if (referer) {
    try {
      const u = new URL(referer);
      if (isAllowedFrontendHost(u.hostname)) return u.origin;
    } catch {
      /* ignore */
    }
  }
  if (configured) return configured;
  return 'https://student.umunsi.com';
}

function isAllowedFrontendHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (h === 'student.umunsi.com' || h === 'umunsi.com' || h === 'www.umunsi.com') return true;
  if (h.endsWith('.vercel.app')) return true;
  return false;
}

function buildParentInvitePath(token) {
  return `/invite?parent_token=${encodeURIComponent(token)}`;
}

module.exports = { resolveFrontendUrl, buildParentInvitePath };
