const pool = require('../db');

async function ensurePresenceSchema() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_users_school_last_seen
      ON users (school_id, last_seen_at DESC)
      WHERE school_id IS NOT NULL;
  `);
}

module.exports = { ensurePresenceSchema };
