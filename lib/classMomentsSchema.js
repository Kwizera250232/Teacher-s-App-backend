const pool = require('../db');

async function ensureClassMomentsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_moments (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS class_moment_images (
      id SERIAL PRIMARY KEY,
      moment_id INTEGER NOT NULL REFERENCES class_moments(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(40) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      payload JSONB,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS class_moment_reads (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      moment_id INTEGER NOT NULL REFERENCES class_moments(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, moment_id)
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, endpoint)
    );
    CREATE INDEX IF NOT EXISTS idx_class_moments_class_published
      ON class_moments (class_id, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_class_moment_images_moment
      ON class_moment_images (moment_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user
      ON user_notifications (user_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_class_moment_reads_user
      ON class_moment_reads (user_id, moment_id);
  `);
}

module.exports = { ensureClassMomentsSchema };
