const pool = require('../db');

async function ensureExpoPushSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expo_push_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expo_push_token TEXT NOT NULL,
      platform VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, expo_push_token)
    );
    CREATE INDEX IF NOT EXISTS idx_expo_push_tokens_user ON expo_push_tokens (user_id);
  `);
}

module.exports = { ensureExpoPushSchema };
