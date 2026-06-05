const pool = require('../db');

async function ensureAchievementsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_achievements (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES class_groups(id) ON DELETE SET NULL,
      title_key VARCHAR(50) NOT NULL,
      period_key VARCHAR(20) NOT NULL DEFAULT 'all_time',
      metadata JSONB DEFAULT '{}',
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (student_id, class_id, title_key, period_key)
    );
    CREATE TABLE IF NOT EXISTS student_displayed_titles (
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      title_key VARCHAR(50) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_id, class_id)
    );
    CREATE TABLE IF NOT EXISTS achievement_feed (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES class_groups(id) ON DELETE SET NULL,
      title_key VARCHAR(50) NOT NULL,
      headline TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS achievement_reactions (
      id SERIAL PRIMARY KEY,
      feed_id INTEGER NOT NULL REFERENCES achievement_feed(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction_type VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (feed_id, user_id, reaction_type)
    );
    CREATE INDEX IF NOT EXISTS idx_student_achievements_class
      ON student_achievements (class_id, earned_at DESC);
    CREATE INDEX IF NOT EXISTS idx_achievement_feed_group
      ON achievement_feed (class_id, group_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_achievement_feed_class
      ON achievement_feed (class_id, created_at DESC);
  `);
}

module.exports = { ensureAchievementsSchema };
