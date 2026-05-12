require('dotenv').config({ path: '/home/umunsi/htdocs/studentapi.umunsi.com/.env' });
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = [
  "ALTER TABLE quiz_questions ALTER COLUMN correct_answer TYPE VARCHAR(500)",
  "ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_correct_answer_check",
  "ALTER TABLE quiz_questions ALTER COLUMN option_a DROP NOT NULL",
  "ALTER TABLE quiz_questions ALTER COLUMN option_b DROP NOT NULL",
  "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'multiple_choice'",
  "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS passage TEXT"
].join(';');
p.query(sql).then(() => { console.log('MIGRATION OK'); p.end(); }).catch(e => { console.error('ERR:', e.message); p.end(); });
