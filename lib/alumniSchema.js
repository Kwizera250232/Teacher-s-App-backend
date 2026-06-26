const fs = require('fs');
const path = require('path');

async function ensureAlumniSchema(pool) {
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    // Extract only alumni-related CREATE TABLE statements
    const alumniLines = sql.split('\n').filter((line) =>
      line.includes('alumni_') ||
      line.includes(' graduation_') ||
      line.includes('CREATE INDEX') && line.includes('alumni') ||
      line.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni') ||
      line.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year') ||
      line.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at') ||
      line.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status')
    );

    for (const line of alumniLines) {
      if (line.trim().startsWith('--') || !line.trim()) continue;
      await pool.query(line).catch(() => {});
    }

    // Also run the ALTER TABLE statements safely
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status VARCHAR(20) DEFAULT 'active'`).catch(() => {});

    console.log('[startup] Alumni schema ready.');
  } catch (err) {
    console.error('[startup] Alumni schema error:', err.message);
  }
}

module.exports = { ensureAlumniSchema };
