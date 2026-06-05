const pool = require('../db');

async function ensureClassGroupQuizzesSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_group_quiz_assignments (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'assigned',
      started_at TIMESTAMPTZ,
      started_by_student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMPTZ,
      submitted_by_student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      score INTEGER,
      total INTEGER,
      draft_answers JSONB NOT NULL DEFAULT '{}',
      final_answers JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (group_id, quiz_id)
    );
    CREATE INDEX IF NOT EXISTS idx_group_quiz_assign_class
      ON class_group_quiz_assignments (class_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_group_quiz_assign_group
      ON class_group_quiz_assignments (group_id, status);
    ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS group_assignment_id INTEGER;
  `);

  // Remove legacy duplicate rows (same group + quiz) before unique index
  await pool.query(`
    DELETE FROM class_group_quiz_assignments a
    USING class_group_quiz_assignments b
    WHERE a.group_id = b.group_id
      AND a.quiz_id = b.quiz_id
      AND a.id < b.id
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_group_quiz_assign_group_quiz_unique
      ON class_group_quiz_assignments (group_id, quiz_id)
  `);
}

module.exports = { ensureClassGroupQuizzesSchema };
