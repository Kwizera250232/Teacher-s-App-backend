const EMPTY = { counts: {}, mine: null, people: [], total: 0 };

export function momentIdNum(id) {
  if (id == null || id === '') return null;
  if (typeof id === 'string' && id.startsWith('pending')) return null;
  const n = typeof id === 'number' ? id : parseInt(String(id), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function canReactToMoment(moment) {
  return Boolean(moment && momentIdNum(moment.id) && !moment._pending);
}

/** Apply like/emoji toggle locally (mirrors server toggle rules). */
export function applyReactionToggle(prev, emoji, removed, normalizedEmoji) {
  const reactions = prev?.reactions ? { ...prev.reactions, counts: { ...prev.reactions.counts } } : { ...EMPTY, counts: {} };
  const counts = { ...reactions.counts };
  let mine = reactions.mine;

  if (removed) {
    if (mine && counts[mine]) {
      counts[mine] = counts[mine] - 1;
      if (counts[mine] <= 0) delete counts[mine];
    }
    mine = null;
  } else {
    if (mine && counts[mine]) {
      counts[mine] = counts[mine] - 1;
      if (counts[mine] <= 0) delete counts[mine];
    }
    counts[normalizedEmoji] = (counts[normalizedEmoji] || 0) + 1;
    mine = normalizedEmoji;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { ...reactions, counts, mine, total };
}

export function normalizeReactionEmoji(raw) {
  if (raw === null || raw === undefined || raw === '') return '❤️';
  const e = String(raw).trim();
  if (e === 'like' || e === '❤') return '❤️';
  return e;
}
