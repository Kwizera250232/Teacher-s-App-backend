const pool = require('/home/umunsi/htdocs/studentapi.umunsi.com/db');
(async () => {
  const r = await pool.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_name='class_payments' ORDER BY ordinal_position`
  );
  r.rows.forEach(x => console.log(x.column_name, '|', x.data_type, '|', x.udt_name));
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
