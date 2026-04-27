require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)')
  .then(() => { console.log('Migration done: phone column added'); process.exit(0); })
  .catch(e => { console.error('Error:', e.message); process.exit(1); });
