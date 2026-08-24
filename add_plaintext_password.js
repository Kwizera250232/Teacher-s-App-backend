const pool = require('./db');
pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plaintext_password TEXT`)
  .then(() => {
    console.log('plaintext_password column added successfully');
    return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='plaintext_password'");
  })
  .then(r => {
    console.log('Verification - column exists:', r.rows.length > 0);
    pool.end();
  })
  .catch(e => {
    console.log('ERROR:', e.message);
    pool.end();
  });
