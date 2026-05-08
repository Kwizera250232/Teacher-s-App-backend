// One-time script: update kwizera admin email from gmail to school email
// Run on VPS: node fix_admin_email.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const OLD_EMAIL = 'kwizerajeandedieu250@gmail.com';
  const NEW_EMAIL = 'kwizera.jeandedieu@brightschool.edu';
  const NEW_NAME  = 'KWIZERA Jean de Dieu';

  // Find the user
  const find = await pool.query('SELECT id, name, email, role FROM users WHERE email = $1', [OLD_EMAIL]);
  if (find.rows.length === 0) {
    console.error('User not found with email:', OLD_EMAIL);
    console.log('Searching by name...');
    const byName = await pool.query("SELECT id, name, email, role FROM users WHERE name ILIKE '%kwizera%'");
    console.log('Found by name:', byName.rows);
    await pool.end();
    return;
  }

  const user = find.rows[0];
  console.log('Found user:', user);

  // Check new email not already taken
  const conflict = await pool.query('SELECT id FROM users WHERE email = $1', [NEW_EMAIL]);
  if (conflict.rows.length > 0) {
    console.log('New email already exists in DB:', NEW_EMAIL, '- no update needed.');
    await pool.end();
    return;
  }

  // Update email and name
  const updated = await pool.query(
    'UPDATE users SET email = $1, name = $2 WHERE id = $3 RETURNING id, name, email, role',
    [NEW_EMAIL, NEW_NAME, user.id]
  );

  console.log('SUCCESS - Updated user:');
  console.log(JSON.stringify(updated.rows[0], null, 2));
  console.log('');
  console.log('You can now login with:');
  console.log('  Email:    ' + NEW_EMAIL);
  console.log('  Password: (your existing password)');

  await pool.end();
}

run().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
