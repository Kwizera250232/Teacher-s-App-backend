const pool = require('../db');

const STATUS_SHARE_TYPES = ['composition', 'dream', 'lesson', 'motivation'];

function isStatusEligibleType(type) {
  return STATUS_SHARE_TYPES.includes(type);
}

const TYPE_SQL = STATUS_SHARE_TYPES.map((t) => `'${t}'`).join(',');

async function isSubscribed(subscriberId, targetId) {
  const r = await pool.query(
    'SELECT 1 FROM subscriptions WHERE subscriber_id = $1 AND target_id = $2',
    [subscriberId, targetId]
  );
  return r.rowCount > 0;
}

async function parentOwnsStudent(parentId, studentId) {
  const r = await pool.query(
    'SELECT 1 FROM parent_children WHERE parent_id = $1 AND student_id = $2',
    [parentId, studentId]
  );
  return r.rowCount > 0;
}

/** Who may read full C. Status / composition text */
async function resolveStatusAccess(viewer, ownerId) {
  if (!viewer?.id) return { can_view_full: false, reason: 'auth' };
  if (viewer.id === ownerId) {
    return { can_view_full: true, reason: 'owner', i_subscribed: false };
  }
  if (['admin', 'teacher', 'head_teacher'].includes(viewer.role)) {
    return { can_view_full: true, reason: 'staff', i_subscribed: false };
  }
  if (viewer.role === 'parent') {
    const linked = await parentOwnsStudent(viewer.id, ownerId);
    return {
      can_view_full: linked,
      reason: linked ? 'parent' : 'not_linked',
      i_subscribed: false,
    };
  }
  if (viewer.role === 'student') {
    const sub = await isSubscribed(viewer.id, ownerId);
    return {
      can_view_full: sub,
      reason: sub ? 'subscribed' : 'subscribe_required',
      i_subscribed: sub,
    };
  }
  return { can_view_full: false, reason: 'forbidden', i_subscribed: false };
}

function applyStatusVisibility(row, preview, access) {
  const base = {
    id: row.id,
    student_id: row.student_id,
    student_name: row.student_name,
    share_id: row.share_id,
    title: preview.title,
    type: row.type,
    view_count: row.view_count,
    expires_at: row.expires_at,
    created_at: row.created_at,
    expires_in_days: row.expires_in_days,
    can_view_full: access.can_view_full,
    i_subscribed: access.i_subscribed,
    locked: !access.can_view_full,
  };
  if (access.can_view_full) {
    return {
      ...base,
      intro: preview.intro,
      content: row.content,
    };
  }
  const teaser = preview.intro
    ? `${preview.intro.slice(0, 100).trim()}…`
    : 'A classmate shared a new composition status.';
  return {
    ...base,
    intro: teaser,
    lock_message: 'Subscribe to this student to read their full C. Status.',
    subscribe_target_id: row.student_id,
  };
}

module.exports = {
  STATUS_SHARE_TYPES,
  TYPE_SQL,
  isStatusEligibleType,
  resolveStatusAccess,
  applyStatusVisibility,
  isSubscribed,
};
