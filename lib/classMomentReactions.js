const pool = require('../db');

const ALLOWED_EMOJI = new Set(['❤️', '👍', '😂', '😮', '😢', '🙏', '👏', '🔥', 'like']);

const EMPTY_REACTIONS = { counts: {}, mine: null, people: [], total: 0 };

function normalizeEmoji(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return '❤️';
  }
  const e = String(raw).trim();
  if (e === 'like' || e === '❤') return '❤️';
  return ALLOWED_EMOJI.has(e) ? e : '❤️';
}

/** Coerce API/DB moment ids (number or numeric string). */
function momentIdNum(id) {
  if (id == null || id === '') return null;
  if (typeof id === 'string' && id.startsWith('pending')) return null;
  const n = typeof id === 'number' ? id : parseInt(String(id), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function attachReactionsToMoments(moments, viewerUserId) {
  if (!moments?.length) return moments || [];

  const idByMoment = new Map();
  const ids = [];
  for (const m of moments) {
    const n = momentIdNum(m.id);
    if (n) {
      idByMoment.set(m, n);
      ids.push(n);
    }
  }
  if (!ids.length) {
    return moments.map((m) => ({ ...m, reactions: { ...EMPTY_REACTIONS } }));
  }

  let rows;
  try {
    rows = await pool.query(
      `SELECT r.moment_id, r.emoji, r.user_id, u.name AS user_name
       FROM class_moment_reactions r
       JOIN users u ON u.id = r.user_id
       WHERE r.moment_id = ANY($1::int[])
       ORDER BY r.created_at ASC`,
      [ids]
    );
  } catch (err) {
    console.error('[classMomentReactions] load:', err.message);
    return moments.map((m) => ({ ...m, reactions: { ...EMPTY_REACTIONS } }));
  }

  const byMoment = new Map();
  for (const row of rows.rows) {
    const mid = momentIdNum(row.moment_id);
    if (!mid) continue;
    if (!byMoment.has(mid)) {
      byMoment.set(mid, { counts: {}, mine: null, people: [] });
    }
    const bag = byMoment.get(mid);
    bag.counts[row.emoji] = (bag.counts[row.emoji] || 0) + 1;
    if (viewerUserId && Number(row.user_id) === Number(viewerUserId)) {
      bag.mine = row.emoji;
    }
    if (bag.people.length < 8) {
      bag.people.push({ user_id: row.user_id, name: row.user_name, emoji: row.emoji });
    }
  }

  return moments.map((m) => {
    const mid = idByMoment.get(m);
    if (!mid) {
      return { ...m, reactions: { ...EMPTY_REACTIONS } };
    }
    const r = byMoment.get(mid) || { counts: {}, mine: null, people: [] };
    const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
    return { ...m, reactions: { ...r, total } };
  });
}

async function setMomentReaction({ momentId, userId, emoji }) {
  const mid = momentIdNum(momentId);
  if (!mid) {
    throw new Error('Invalid moment id');
  }
  const normalized = normalizeEmoji(emoji);
  const existing = await pool.query(
    'SELECT emoji FROM class_moment_reactions WHERE moment_id = $1 AND user_id = $2',
    [mid, userId]
  );
  if (existing.rows.length && existing.rows[0].emoji === normalized) {
    await pool.query(
      'DELETE FROM class_moment_reactions WHERE moment_id = $1 AND user_id = $2',
      [mid, userId]
    );
    return { removed: true, emoji: null };
  }
  await pool.query(
    `INSERT INTO class_moment_reactions (moment_id, user_id, emoji)
     VALUES ($1,$2,$3)
     ON CONFLICT (moment_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`,
    [mid, userId, normalized]
  );
  return { removed: false, emoji: normalized };
}

module.exports = {
  attachReactionsToMoments,
  setMomentReaction,
  normalizeEmoji,
  momentIdNum,
  ALLOWED_EMOJI,
};
