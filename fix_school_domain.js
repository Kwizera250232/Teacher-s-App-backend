require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const userEmail = 'kwizera.jeandedieu@brightschool.edu';
  const targetDomain = 'brightschool.edu';

  const userRes = await pool.query(
    'SELECT id, name, email, role, school_id FROM users WHERE email=$1',
    [userEmail]
  );

  if (!userRes.rows.length) {
    console.error('User not found:', userEmail);
    process.exit(1);
  }

  const user = userRes.rows[0];
  if (!user.school_id) {
    console.error('User has no school_id:', user);
    process.exit(1);
  }

  const schoolRes = await pool.query(
    'SELECT id, name, code, email_domain FROM schools WHERE id=$1',
    [user.school_id]
  );

  if (!schoolRes.rows.length) {
    console.error('School not found for school_id:', user.school_id);
    process.exit(1);
  }

  const school = schoolRes.rows[0];
  console.log('Before:', { user, school });

  await pool.query('UPDATE schools SET email_domain=$1 WHERE id=$2', [targetDomain, user.school_id]);

  const updated = await pool.query(
    'SELECT id, name, code, email_domain FROM schools WHERE id=$1',
    [user.school_id]
  );

  console.log('After:', updated.rows[0]);
  console.log('Done. Login should now work for', userEmail);

  await pool.end();
}

run().catch(async (err) => {
  console.error('FAILED:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
