const pool = require('../db');

async function ensureClassImageSchema() {
  await pool.query(`
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS avatar_path TEXT;
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS cover_path TEXT;
  `);
}

module.exports = { ensureClassImageSchema };
