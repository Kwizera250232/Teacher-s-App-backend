require('dotenv').config({ override: true });
const pool = require('./db');

const sql = `
  CREATE TABLE IF NOT EXISTS student_shares (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('lesson','dream','motivation')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    visibility VARCHAR(20) NOT NULL DEFAULT 'subscribers' CHECK (visibility IN ('subscribers'))
  );
  CREATE INDEX IF NOT EXISTS idx_student_shares_type ON student_shares(type);
  CREATE INDEX IF NOT EXISTS idx_student_shares_student ON student_shares(student_id);
`;

pool.query(sql)
  .then(() => { console.log('Migration done! student_shares table created.'); process.exit(0); })
  .catch(e => { console.error('Migration error:', e.message); process.exit(1); });
