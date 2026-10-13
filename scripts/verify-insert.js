// Verify the fixed INSERT works against the real DB (insert + delete test row)
const pool = require('/home/umunsi/htdocs/studentapi.umunsi.com/db');
(async () => {
  const status = 'PENDING';
  const durDays = 30;
  const paidAt = status === 'SUCCESSFUL' ? new Date() : null;
  const expiresAt = status === 'SUCCESSFUL' ? new Date(Date.now() + durDays * 86400000) : null;
  const ref = `test-${Date.now()}`;
  const ins = await pool.query(
    `INSERT INTO class_payments (class_id, student_id, phone, amount, reference_id, status, mode, paid_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [1, 1, '0783450859', 100, ref, status, 'live', paidAt, expiresAt]
  );
  console.log('INSERT OK, id =', ins.rows[0].id);
  // also test the make_interval update path
  await pool.query(
    `UPDATE class_payments SET status=$1, paid_at=NOW(),
       expires_at = GREATEST(COALESCE(
         (SELECT MAX(expires_at) FROM class_payments
          WHERE class_id=$2 AND student_id=$3 AND status='SUCCESSFUL' AND expires_at > NOW()),
         NOW()), NOW()) + make_interval(days => $4)
     WHERE id=$5`,
    ['SUCCESSFUL', 1, 1, durDays, ins.rows[0].id]
  );
  const chk = await pool.query('SELECT status, expires_at FROM class_payments WHERE id=$1', [ins.rows[0].id]);
  console.log('UPDATE OK:', JSON.stringify(chk.rows[0]));
  await pool.query('DELETE FROM class_payments WHERE id=$1', [ins.rows[0].id]);
  console.log('cleanup done');
  process.exit(0);
})().catch(e => { console.log('FAIL:', e.message); process.exit(1); });
