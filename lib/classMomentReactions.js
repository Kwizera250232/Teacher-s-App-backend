const pool = require('../db');

const ALLOWED_EMOJI = new Set(['❤️', '👍', '😂', '😮', '😢', '🙏', '👏', '🔥', 'like']);

function normalizeEmoji(raw) {
  const e = String(raw || 'like').trim();
  if (e === 'like' || e === '❤') return '❤️';
  return ALLOWED_EMOJI.has(e) ? e : '❤️';
}

async function attachReactionsToMoments(moments, viewerUserId) {
  if (!moments?.length) return moments || [];
  const ids = moments.map((m) => m.id).filter((id) => typeof id === 'number' && id > 0);
  if (!ids.length) return moments;

  const rows = await pool.query(
    `SELECT r.moment_id, r.emoji, r.user_id, u.name AS user_name
     FROM class_moment_reactions r
     JOIN users u ON u.id = r.user_id
     WHERE r.moment_id = ANY($1::int[])
     ORDER BY r.created_at ASC`,
    [ids]
  );

  const byMoment = new Map();
  for (const row of rows.rows) {
    if (!byMoment.has(row.moment_id)) {
      byMoment.set(row.moment_id, { counts: {}, mine: null, people: [] });
    }
    const bag = byMoment.get(row.moment_id);
    bag.counts[row.emoji] = (bag.counts[row.emoji] || 0) + 1;
    if (viewerUserId && row.user_id === viewerUserId) {
      bag.mine = row.emoji;
    }
    if (bag.people.length < 8) {
      bag.people.push({ user_id: row.user_id, name: row.user_name, emoji: row.emoji });
    }
  }

  return moments.map((m) => {
    if (typeof m.id !== 'number' || m.id <= 0 || String(m.id).startsWith('pending')) {
      return { ...m, reactions: { counts: {}, mine: null, people: [], total: 0 } };
    }
    const r = byMoment.get(m.id) || { counts: {}, mine: null, people: [] };
    const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
    return { ...m, reactions: { ...r, total } };
  });
}

async function setMomentReaction({ momentId, userId, emoji }) {
  const normalized = normalizeEmoji(emoji);
  const existing = await pool.query(
    'SELECT emoji FROM class_moment_reactions WHERE moment_id = $1 AND user_id = $2',
    [momentId, userId]
  );
  if (existing.rows.length && existing.rows[0].emoji === normalized) {
    await pool.query(
      'DELETE FROM class_moment_reactions WHERE moment_id = $1 AND user_id = $2',
      [momentId, userId]
    );
    return { removed: true, emoji: null };
  }
  await pool.query(
    `INSERT INTO class_moment_reactions (moment_id, user_id, emoji)
     VALUES ($1,$2,$3)
     ON CONFLICT (moment_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`,
    [momentId, userId, normalized]
  );
  return { removed: false, emoji: normalized };
}

module.exports = {
  attachReactionsToMoments,
  setMomentReaction,
  normalizeEmoji,
  ALLOWED_EMOJI,
};
