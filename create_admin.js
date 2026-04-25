const bcrypt = require('/home/umunsi-api/htdocs/api.umunsi.com/node_modules/bcryptjs');
const { Client } = require('pg');

async function main() {
  const hash = await bcrypt.hash('Admin@123456', 10);
  const client = new Client({ connectionString: 'postgresql://students_app_user:KWIZERA783450859@k@localhost:5432/students_app' });
  await client.connect();
  const res = await client.query(
    "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'admin') ON CONFLICT (email) DO NOTHING RETURNING id",
    ['Admin', 'admin@umunsi.com', hash]
  );
  console.log(res.rowCount ? 'Admin created: id=' + res.rows[0].id : 'Admin already exists');
  await client.end();
}

main().catch(console.error);
