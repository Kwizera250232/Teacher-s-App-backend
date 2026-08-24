const pool = require('./db');
pool.query("SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'cat_totals_config') as exists")
  .then(r => {
    console.log('TABLE EXISTS:', r.rows[0].exists);
    if (r.rows[0].exists) {
      return pool.query('SELECT * FROM cat_totals_config LIMIT 5');
    }
  })
  .then(r => {
    if (r) console.log('ROWS:', JSON.stringify(r.rows));
    pool.end();
  })
  .catch(e => {
    console.log('ERROR:', e.message);
    pool.end();
  });
