const pool = require('../db');

async function ensureParentHubSchema() {
  await pool.query(`
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS district VARCHAR(120);
    ALTER TABLE schools ADD COLUMN IF NOT EXISTS sector VARCHAR(120);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(40) DEFAULT 'chat';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS context_json JSONB;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_announcements (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS parent_notifications (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(40) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      payload JSONB,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_parent_notifications_parent ON parent_notifications(parent_id, is_read);
  `);
}

async function insertParentNotification({
  parentId,
  studentId,
  senderId,
  type,
  title,
  body,
  payload,
}) {
  const result = await pool.query(
    `INSERT INTO parent_notifications (parent_id, student_id, sender_id, type, title, body, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [parentId, studentId || null, senderId || null, type, title, body.slice(0, 2000), payload || null]
  );
  return result.rows[0];
}

async function sendParentInAppMessage({ senderId, parentId, content, messageType, contextJson }) {
  const result = await pool.query(
    `INSERT INTO messages (sender_id, receiver_id, content, message_type, context_json)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [senderId, parentId, content.slice(0, 4000), messageType || 'chat', contextJson || null]
  );
  return result.rows[0];
}

async function resolveParentRecipients({ senderId, senderRole, schoolId, studentId, classId, parentIds }) {
  if (Array.isArray(parentIds) && parentIds.length) {
    const ids = parentIds.map((id) => parseInt(id, 10)).filter(Boolean);
    const r = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.email FROM users u WHERE u.role = 'parent' AND u.id = ANY($1::int[])`,
      [ids]
    );
    return r.rows;
  }

  if (studentId) {
    const r = await pool.query(
      `SELECT u.id, u.name, u.email FROM parent_children pc
       JOIN users u ON u.id = pc.parent_id WHERE pc.student_id = $1`,
      [studentId]
    );
    return r.rows;
  }

  if (classId) {
    const r = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.email, cm.student_id
       FROM class_members cm
       JOIN parent_children pc ON pc.student_id = cm.student_id
       JOIN users u ON u.id = pc.parent_id
       WHERE cm.class_id = $1`,
      [classId]
    );
    return r.rows;
  }

  let targetSchoolId = schoolId;
  if (!targetSchoolId && senderRole === 'head_teacher') {
    const row = await pool.query('SELECT school_id FROM users WHERE id = $1', [senderId]);
    targetSchoolId = row.rows[0]?.school_id;
  }
  if (!targetSchoolId) return [];

  const r = await pool.query(
    `SELECT DISTINCT u.id, u.name, u.email FROM parent_children pc
     JOIN users st ON st.id = pc.student_id
     JOIN users u ON u.id = pc.parent_id
     WHERE st.school_id = $1`,
    [targetSchoolId]
  );
  return r.rows;
}

module.exports = {
  ensureParentHubSchema,
  insertParentNotification,
  sendParentInAppMessage,
  resolveParentRecipients,
};
