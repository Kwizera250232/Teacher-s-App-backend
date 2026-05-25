const pool = require('../db');

let ready = false;

async function ensureFeedTables() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classroom_feed_posts (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_type VARCHAR(30) NOT NULL,
      body TEXT,
      media_url TEXT,
      media_mime VARCHAR(100),
      voice_duration_sec INTEGER,
      classwork_summary TEXT,
      repost_of_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS classroom_feed_likes (
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS classroom_feed_comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      parent_comment_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS class_co_teachers (
      class_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      added_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (class_id, teacher_id)
    );
  `);
  ready = true;
}

module.exports = { ensureFeedTables };
