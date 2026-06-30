const fs = require('fs');
const path = require('path');

async function ensureAlumniSchema(pool) {
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    // Split on semicolons to get complete statements (handles multi-line CREATE TABLE)
    const statements = sql
      .split(/;(?=\s*(?:--|[A-Z]|\n|$))/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    // Filter for alumni-related statements only
    const alumniStatements = statements.filter(s => {
      const lower = s.toLowerCase();
      return lower.includes('alumni_') ||
        lower.includes('graduation_') ||
        (lower.includes('create index') && lower.includes('alumni')) ||
        (lower.includes('alter table users') && (lower.includes('is_alumni') || lower.includes('graduation_year') || lower.includes('graduated_at') || lower.includes('alumni_status')));
    });

    for (const stmt of alumniStatements) {
      await pool.query(stmt + ';').catch((e) => {
        console.warn('[alumniSchema] statement skipped:', e.message.slice(0, 100));
      });
    }

    // Ensure ALTER TABLE statements run safely
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
