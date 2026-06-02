const pool = require('../db');

async function ensureParentSmsSchema() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_notify BOOLEAN NOT NULL DEFAULT TRUE;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_sms_log (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_phone VARCHAR(20) NOT NULL,
      body TEXT NOT NULL,
      notification_type VARCHAR(40),
      twilio_sid VARCHAR(64),
      status VARCHAR(20) NOT NULL DEFAULT 'sent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_parent_sms_log_parent_day
      ON parent_sms_log (parent_id, created_at DESC);
  `);
}

module.exports = { ensureParentSmsSchema };
