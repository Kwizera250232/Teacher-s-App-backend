const pool = require('../db');
const { normalizeRwandaMobile, validateRwandaMobileInput } = require('./phoneNormalize');
const { ensureParentSmsSchema } = require('./parentSmsSchema');

ensureParentSmsSchema().catch((e) => console.error('[parentSms] schema:', e.message));

const SMS_NOTIFY_TYPES = new Set([
  'homework',
  'class_moment',
  'school_announcement',
  'homework_reminder',
  'class_update',
  'quiz',
  'info',
]);

const DAILY_SMS_CAP = parseInt(process.env.PARENT_SMS_DAILY_CAP || '30', 10);

function isSmsConfigured() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  const messagingSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  return Boolean(sid && token && (from || messagingSid));
}

function buildSmsBody({ title, body }) {
  const site = (process.env.FRONTEND_URL || 'https://student.umunsi.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const t = String(title || 'UClass update').replace(/\s+/g, ' ').trim();
  const b = String(body || '').replace(/\s+/g, ' ').trim();
  const core = b ? `${t} — ${b}` : t;
  const msg = `UClass: ${core}. Open ${site}`;
  return msg.length > 320 ? `${msg.slice(0, 317)}...` : msg;
}

async function countSmsToday(parentId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM parent_sms_log
     WHERE parent_id = $1 AND created_at > NOW() - INTERVAL '24 hours' AND status = 'sent'`,
    [parentId]
  );
  return r.rows[0]?.c || 0;
}

async function logSms({ parentId, toPhone, body, notificationType, twilioSid, status }) {
  await ensureParentSmsSchema();
  await pool.query(
    `INSERT INTO parent_sms_log (parent_id, to_phone, body, notification_type, twilio_sid, status)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [parentId, toPhone, body.slice(0, 500), notificationType || null, twilioSid || null, status || 'sent']
  );
}

async function sendTwilioSms(toE164, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !authToken) {
    return { ok: false, skipped: true, reason: 'twilio_not_configured' };
  }
  if (!from && !messagingServiceSid) {
    return { ok: false, skipped: true, reason: 'twilio_from_missing' };
  }

  const params = new URLSearchParams({ To: toE164, Body: body });
  if (messagingServiceSid) {
    params.set('MessagingServiceSid', messagingServiceSid);
  } else {
    params.set('From', from);
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[parentSms] Twilio error', res.status, data);
    return { ok: false, error: data.message || `Twilio ${res.status}` };
  }
  return { ok: true, sid: data.sid };
}

async function getParentSmsTarget(parentId) {
  const r = await pool.query(
    `SELECT id, phone, sms_notify, role FROM users WHERE id = $1`,
    [parentId]
  );
  const row = r.rows[0];
  if (!row || row.role !== 'parent') return null;
  if (row.sms_notify === false) return { ...row, skip: 'opt_out' };
  const e164 = normalizeRwandaMobile(row.phone);
  if (!e164) return { ...row, skip: 'no_phone' };
  return { ...row, e164 };
}

/**
 * Send SMS to one parent user (if phone on file and SMS enabled).
 */
async function sendParentSms(parentId, { title, body, type }) {
  if (!isSmsConfigured()) return { sent: 0, skipped: 'not_configured' };
  if (type && !SMS_NOTIFY_TYPES.has(type)) return { sent: 0, skipped: 'type' };

  const target = await getParentSmsTarget(parentId);
  if (!target) return { sent: 0, skipped: 'not_parent' };
  if (target.skip) return { sent: 0, skipped: target.skip };

  const today = await countSmsToday(parentId);
  if (today >= DAILY_SMS_CAP) {
    return { sent: 0, skipped: 'daily_cap' };
  }

  const smsBody = buildSmsBody({ title, body });
  const result = await sendTwilioSms(target.e164, smsBody);
  if (!result.ok) {
    await logSms({
      parentId,
      toPhone: target.e164,
      body: smsBody,
      notificationType: type,
      status: 'failed',
    }).catch(() => {});
    return { sent: 0, error: result.error || result.reason };
  }

  await logSms({
    parentId,
    toPhone: target.e164,
    body: smsBody,
    notificationType: type,
    twilioSid: result.sid,
    status: 'sent',
  });
  return { sent: 1, sid: result.sid };
}

async function updateParentPhone(parentId, phoneRaw) {
  const check = validateRwandaMobileInput(phoneRaw);
  if (!check.valid) {
    const err = new Error(check.error);
    err.status = 400;
    throw err;
  }
  await ensureParentSmsSchema();
  const display = check.display || phoneRaw.trim();
  await pool.query(
    'UPDATE users SET phone = $1 WHERE id = $2 AND role = $3',
    [display, parentId, 'parent']
  );
  return { phone: display, e164: check.e164 };
}

module.exports = {
  isSmsConfigured,
  sendParentSms,
  updateParentPhone,
  getParentSmsTarget,
  validateRwandaMobileInput,
  normalizeRwandaMobile,
  buildSmsBody,
  SMS_NOTIFY_TYPES,
};
