const webpush = require('web-push');
const pool = require('../db');
const { ensureClassMomentsSchema } = require('./classMomentsSchema');

let configured = false;

function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@umunsi.com';
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    return true;
  } catch (err) {
    console.warn('[push] VAPID configuration failed:', err.message);
    return false;
  }
}

function isPushEnabled() {
  if (!configured) initWebPush();
  return configured;
}

function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function buildPayload({ title, body, url, tag }) {
  return JSON.stringify({
    title: String(title || 'UClass').slice(0, 120),
    body: String(body || '').slice(0, 500),
    url: url || '/',
    tag: tag || 'uclass',
  });
}

async function removeSubscription(subscriptionId) {
  await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [subscriptionId]);
}

async function sendPushToUser(userId, notification) {
  if (!userId || !isPushEnabled()) return { sent: 0, failed: 0, skipped: true };

  await ensureClassMomentsSchema();
  const subs = await pool.query(
    'SELECT id, endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  if (!subs.rows.length) return { sent: 0, failed: 0, skipped: false };

  const payload = buildPayload(notification);
  let sent = 0;
  let failed = 0;

  for (const sub of subs.rows) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth_key },
    };
    try {
      await webpush.sendNotification(pushSub, payload);
      sent += 1;
    } catch (err) {
      failed += 1;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await removeSubscription(sub.id);
      } else {
        console.warn('[push] send failed user=%s sub=%s: %s', userId, sub.id, err.message);
      }
    }
  }

  return { sent, failed, skipped: false };
}

async function sendPushToUsers(userIds, notification) {
  const unique = [...new Set((userIds || []).map((id) => parseInt(id, 10)).filter(Boolean))];
  let sent = 0;
  let failed = 0;
  for (const uid of unique) {
    const result = await sendPushToUser(uid, notification);
    sent += result.sent;
    failed += result.failed;
  }
  return { sent, failed };
}

module.exports = {
  isPushEnabled,
  getVapidPublicKey,
  sendPushToUser,
  sendPushToUsers,
};
