require('dotenv').config();
const db = require('./db');

async function run() {
  // Find the user first
  const find = await db.query(
    "SELECT id, name, email, role FROM users WHERE email ILIKE $1",
    ['%kwizera%']
  );
  console.log('Found users:', JSON.stringify(find.rows, null, 2));

  if (find.rows.length === 0) {
    console.log('No user found');
    process.exit(1);
  }

  // Update email and name for the gmail account
  const target = find.rows.find(r => r.email.includes('gmail.com'));
  if (!target) {
    console.log('Gmail account not found among:', find.rows.map(r => r.email));
    process.exit(1);
  }

  console.log('Updating user ID:', target.id, '| Old email:', target.email);

  const update = await db.query(
    "UPDATE users SET email = $1, name = $2 WHERE id = $3 RETURNING id, name, email, role",
    ['kwizera.jeandedieu@brightschool.edu', 'KWIZERA Jean de Dieu', target.id]
  );

  console.log('Updated:', JSON.stringify(update.rows[0], null, 2));
  process.exit(0);
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
