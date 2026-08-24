const pool = require('./db');
pool.query(`
  CREATE TABLE IF NOT EXISTS cat_totals_config (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    subject TEXT DEFAULT 'General',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, test_number, subject)
  );
`)
  .then(() => {
    console.log('cat_totals_config table created successfully');
    return pool.query("SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'cat_totals_config') as exists");
  })
  .then(r => {
    console.log('Verification - TABLE EXISTS:', r.rows[0].exists);
    pool.end();
  })
  .catch(e => {
    console.log('ERROR:', e.message);
    pool.end();
  });
