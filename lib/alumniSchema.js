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
    await pool.query(`ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS uploader_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS grade_level VARCHAR(20)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS subject VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS language VARCHAR(50)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS image_path VARCHAR(500)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS creator_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS description TEXT`).catch(() => {});

    console.log('[startup] Alumni schema ready.');
  } catch (err) {
    console.error('[startup] Alumni schema error:', err.message);
  }
}

module.exports = { ensureAlumniSchema };
