let ensured = false;

async function ensureStudentSharesModerationColumns(pool) {
  if (ensured) return;
  await pool.query(`
    ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS school VARCHAR(200);
    ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS class_name VARCHAR(100);
    ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(100);
    ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
    ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
    ALTER TABLE student_shares ADD COLUMN IF NOT EXISTS review_note TEXT;
  `);
  await pool.query(`
    ALTER TABLE student_shares DROP CONSTRAINT IF EXISTS student_shares_status_check;
    ALTER TABLE student_shares ADD CONSTRAINT student_shares_status_check
      CHECK (status IN ('pending','approved','declined'));
  `).catch(() => {});
  await pool.query(`
    UPDATE student_shares SET status = 'approved'
    WHERE status IS NULL OR status = '' OR status NOT IN ('pending','approved','declined')
  `).catch(() => {});
  ensured = true;
}

module.exports = { ensureStudentSharesModerationColumns };
