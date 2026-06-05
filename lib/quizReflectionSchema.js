const pool = require('../db');

async function ensureQuizReflectionSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_reflection_reports (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      assignment_id INTEGER REFERENCES class_group_quiz_assignments(id) ON DELETE SET NULL,
      group_id INTEGER REFERENCES class_groups(id) ON DELETE SET NULL,
      reporter_student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_type VARCHAR(10) NOT NULL DEFAULT 'group',
      subject TEXT,
      quiz_title TEXT,
      group_name TEXT,
      difficulty TEXT,
      improvement TEXT,
      student_question TEXT,
      crown_title_key TEXT,
      score INTEGER,
      total INTEGER,
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      teacher_comment TEXT,
      teacher_commented_at TIMESTAMPTZ,
      student_read_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_reflection_class
      ON quiz_reflection_reports (class_id, submitted_at DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS idx_quiz_reflection_reporter
      ON quiz_reflection_reports (reporter_student_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_reflection_group_once
      ON quiz_reflection_reports (assignment_id)
      WHERE assignment_id IS NOT NULL AND submitted_at IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_reflection_solo_once
      ON quiz_reflection_reports (quiz_id, reporter_student_id)
      WHERE assignment_id IS NULL AND submitted_at IS NOT NULL;

    CREATE TABLE IF NOT EXISTS quiz_reflection_member_notes (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES quiz_reflection_reports(id) ON DELETE CASCADE,
      member_student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_name TEXT,
      grade VARCHAR(24),
      showed_weakness BOOLEAN NOT NULL DEFAULT FALSE,
      help_needed TEXT,
      leader_comment TEXT,
      UNIQUE (report_id, member_student_id)
    );
  `);
}

module.exports = { ensureQuizReflectionSchema };
