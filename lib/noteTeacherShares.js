const pool = require('../db');
const { assertSameSchoolTeachers, getTeacherSchoolId } = require('./quizTeacherShares');

async function ensureNoteTeacherShareSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS note_teacher_shares (
      id SERIAL PRIMARY KEY,
      source_note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      source_class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      source_teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      message TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT note_teacher_shares_status_check
        CHECK (status IN ('pending', 'accepted', 'declined'))
    );
    CREATE INDEX IF NOT EXISTS idx_note_teacher_shares_recipient
      ON note_teacher_shares (recipient_teacher_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_note_teacher_shares_target
      ON note_teacher_shares (target_class_id, status)
      WHERE target_class_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_note_teacher_shares_unique_active
      ON note_teacher_shares (source_note_id, recipient_teacher_id, target_class_id)
      WHERE status IN ('pending', 'accepted') AND target_class_id IS NOT NULL;
  `);
}

module.exports = {
  ensureNoteTeacherShareSchema,
  assertSameSchoolTeachers,
  getTeacherSchoolId,
};
