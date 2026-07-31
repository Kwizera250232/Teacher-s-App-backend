require('dotenv').config();
const pool = require('./db');
(async () => {
  try {
    const ok = await pool.query('SELECT 1 as ok');
    console.log('DB OK:', ok.rows[0].ok);
    const cls = await pool.query("SELECT id, name, subject, class_code, teacher_id FROM classes WHERE class_code = $1", ['LKAGY5']);
    console.log('P6A/LKAGY5:', cls.rows);
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='quizzes' ORDER BY ordinal_position");
    console.log('quizzes columns:', cols.rows.map(r => r.column_name));
    const qcols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='quiz_questions' ORDER BY ordinal_position");
    console.log('quiz_questions columns:', qcols.rows.map(r => r.column_name));
  } catch (e) {
    console.error('ERR:', e.code, e.message);
  } finally {
    pool.end();
  }
})();
