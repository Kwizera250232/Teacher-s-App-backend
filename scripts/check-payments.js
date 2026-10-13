const pool = require('/home/umunsi/htdocs/studentapi.umunsi.com/db');
(async () => {
  const r = await pool.query(
    `SELECT p.id, p.class_id, p.student_id, u.name AS student, p.phone, p.amount,
            p.status, p.mode, p.paid_at, p.expires_at, p.created_at
     FROM class_payments p LEFT JOIN users u ON u.id = p.student_id
     ORDER BY p.created_at DESC LIMIT 20`
  );
  console.log('class_payments rows:', r.rows.length);
  r.rows.forEach(x => console.log(JSON.stringify(x)));
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
