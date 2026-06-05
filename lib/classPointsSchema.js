const pool = require('../db');

async function ensureClassPointsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_groups (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS class_group_members (
      group_id INTEGER NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_role VARCHAR(40),
      PRIMARY KEY (group_id, student_id)
    );
    ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE class_group_members ADD COLUMN IF NOT EXISTS team_role VARCHAR(40);
    CREATE TABLE IF NOT EXISTS class_point_events (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES class_groups(id) ON DELETE SET NULL,
      whole_class BOOLEAN NOT NULL DEFAULT FALSE,
      value INTEGER NOT NULL DEFAULT 1,
      skill VARCHAR(40) NOT NULL DEFAULT 'on_task',
      note TEXT,
      undone BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_class_point_events_class_created
      ON class_point_events (class_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_class_point_events_student
      ON class_point_events (class_id, student_id) WHERE NOT undone;
    CREATE INDEX IF NOT EXISTS idx_class_groups_class
      ON class_groups (class_id);
  `);
}

module.exports = { ensureClassPointsSchema };
