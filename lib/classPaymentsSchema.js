const pool = require('../db');

let done = false;

async function ensureClassPaymentsSchema() {
  if (done) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_payment_settings (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      enabled BOOLEAN DEFAULT FALSE,
      amount_rwf INTEGER DEFAULT 0,
      duration_days INTEGER DEFAULT 30,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS class_payments (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone VARCHAR(20),
      amount INTEGER NOT NULL,
      reference_id VARCHAR(64) UNIQUE NOT NULL,
      status VARCHAR(30) DEFAULT 'PENDING',
      mode VARCHAR(20) DEFAULT 'live',
      paid_at TIMESTAMP,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_class_payments_lookup
      ON class_payments (class_id, student_id, status, expires_at);

    CREATE TABLE IF NOT EXISTS teacher_withdrawals (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone VARCHAR(20),
      amount INTEGER NOT NULL,
      reference_id VARCHAR(64) UNIQUE NOT NULL,
      status VARCHAR(30) DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_teacher_withdrawals_teacher
      ON teacher_withdrawals (teacher_id, status);
  `);
  // Self-heal: if the class duration was raised after a student paid, honour the
  // full configured duration — a payer must never lose days they paid for.
  await pool.query(
    `UPDATE class_payments p
        SET expires_at = p.paid_at + make_interval(days => s.duration_days)
       FROM class_payment_settings s
      WHERE p.class_id = s.class_id
        AND p.status = 'SUCCESSFUL'
        AND p.paid_at IS NOT NULL
        AND p.expires_at < p.paid_at + make_interval(days => s.duration_days)`
  );
  done = true;
  console.log('[classPayments] tables ready');
}

module.exports = { ensureClassPaymentsSchema };
