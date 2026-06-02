const pool = require('../db');
const { ensureExpoPushSchema } = require('./expoPushSchema');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

ensureExpoPushSchema().catch((e) => console.error('[expoPush] schema:', e.message));

function channelForType(type) {
  if (type === 'homework' || type === 'homework_reminder') return 'homework';
  if (type === 'class_moment') return 'class_moments';
  if (type === 'school_announcement') return 'school';
  return 'default';
}

async function registerExpoPushToken({ userId, token, platform }) {
  const t = String(token || '').trim();
  if (!t || !userId) return null;
  await ensureExpoPushSchema();
  const r = await pool.query(
    `INSERT INTO expo_push_tokens (user_id, expo_push_token, platform, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (user_id, expo_push_token) DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()
     RETURNING *`,
    [userId, t, platform || null]
  );
  return r.rows[0];
}

async function removeExpoPushToken({ userId, token }) {
  if (!userId || !token) return;
  await pool.query(
    'DELETE FROM expo_push_tokens WHERE user_id = $1 AND expo_push_token = $2',
    [userId, String(token).trim()]
  );
}

async function tokensForUser(userId) {
  const r = await pool.query(
    'SELECT expo_push_token FROM expo_push_tokens WHERE user_id = $1',
    [userId]
  );
  return r.rows.map((row) => row.expo_push_token).filter(Boolean);
}

async function sendExpoPushMessages(messages) {
  if (!messages.length) return { ok: true, sent: 0 };
  const headers = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  let sent = 0;
  for (const chunk of chunks) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[expoPush] send failed', res.status, data);
      continue;
    }
    const tickets = data.data || [];
    for (const ticket of tickets) {
      if (ticket.status === 'ok') sent += 1;
      else if (ticket.details?.error === 'DeviceNotRegistered') {
        const bad = chunk[tickets.indexOf(ticket)]?.to;
        if (bad) {
          await pool.query('DELETE FROM expo_push_tokens WHERE expo_push_token = $1', [bad]).catch(() => {});
        }
      }
    }
  }
  return { ok: true, sent };
}

/**
 * Send push to one user (all registered devices).
 */
async function sendExpoPushToUser(userId, { title, body, data, type }) {
  const tokens = await tokensForUser(userId);
  if (!tokens.length) return { sent: 0 };
  const channelId = channelForType(type || data?.type);
  const messages = tokens.map((to) => ({
    to,
    title: String(title || 'UClass').slice(0, 120),
    body: String(body || '').slice(0, 240),
    data: data || {},
    sound: 'default',
    priority: 'high',
    channelId,
  }));
  return sendExpoPushMessages(messages);
}

/**
 * Notify all parents linked to students in a class (e.g. new homework).
 */
async function notifyParentsInClass(classId, { title, body, type, payload, senderId }) {
  const { insertParentNotification } = require('./parentHub');
  const parents = await pool.query(
    `SELECT DISTINCT u.id AS parent_id, cm.student_id
     FROM class_members cm
     JOIN parent_children pc ON pc.student_id = cm.student_id
     JOIN users u ON u.id = pc.parent_id
     WHERE cm.class_id = $1`,
    [classId]
  );

  for (const row of parents.rows) {
    await insertParentNotification({
      parentId: row.parent_id,
      studentId: row.student_id,
      senderId: senderId || null,
      type: type || 'info',
      title,
      body,
      payload: payload || null,
    });
  }
  return { parents: parents.rows.length };
}

module.exports = {
  registerExpoPushToken,
  removeExpoPushToken,
  sendExpoPushToUser,
  sendExpoPushMessages,
  notifyParentsInClass,
  channelForType,
};
