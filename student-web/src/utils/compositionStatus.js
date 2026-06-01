/** Types that can be published as 7-day C. Status */
export const STATUS_ELIGIBLE_TYPES = ['composition', 'dream', 'lesson', 'motivation'];

export function isApprovedShare(share) {
  return String(share?.status || '').toLowerCase().trim() === 'approved';
}

export function isPickableType(type) {
  const t = String(type || '').toLowerCase().trim();
  if (!t) return true;
  return STATUS_ELIGIBLE_TYPES.includes(t);
}

export function parseCompositionPreview(content) {
  const lines = String(content || '').split('\n');
  const title = lines[0]?.replace(/^📌\s*/, '') || 'Composition';
  let intro = '';
  let section = null;
  const buf = [];
  for (const line of lines.slice(1)) {
    if (line === '📖 Introduction') {
      if (section === 'intro') intro = buf.join('\n').trim();
      section = 'intro';
      buf.length = 0;
    } else if (line === '📝 Body' || line === '🏁 Conclusion') {
      if (section === 'intro' && !intro) intro = buf.join('\n').trim();
      section = 'other';
      buf.length = 0;
    } else {
      buf.push(line);
    }
  }
  if (section === 'intro' && !intro) intro = buf.join('\n').trim();
  return { title, intro: intro.slice(0, 280) };
}

export function mapShareToPickable(share) {
  return {
    id: share.id,
    type: share.type,
    status: share.status,
    created_at: share.created_at,
    ...parseCompositionPreview(share.content),
  };
}

export function normalizePickableResponse(picks) {
  if (!picks) return { items: [], pending_count: 0 };
  const items = Array.isArray(picks) ? picks : (picks.items || []);
  return {
    items,
    pending_count: picks.pending_count ?? 0,
  };
}

export async function loadPickableShares(token, api) {
  let picks;
  try {
    picks = await api.get('/composition-status/pickable-shares?wrap=1', token);
  } catch (e) {
    if (/404|not found/i.test(String(e.message))) {
      picks = await api.get('/student/composition-status/pickable-shares?wrap=1', token);
    } else throw e;
  }
  let { items, pending_count: pendingCount } = normalizePickableResponse(picks);

  if (!items.length) {
    try {
      const shares = await api.get('/student-shares', token);
      const rows = Array.isArray(shares) ? shares : [];
      items = rows
        .filter((s) => isPickableType(s.type) && isApprovedShare(s))
        .map(mapShareToPickable);
      if (!pendingCount) {
        pendingCount = rows.filter(
          (s) => isPickableType(s.type) && String(s.status || '').toLowerCase().trim() === 'pending'
        ).length;
      }
    } catch {
      /* keep empty */
    }
  }

  return { items, pending_count: pendingCount };
}
