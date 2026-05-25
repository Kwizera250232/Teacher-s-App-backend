const pool = require('../db');

let ready = false;
let bootstrapping = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(sql) {
  await pool.query(sql);
}

async function ensureFeedTables() {
  if (ready) return;
  if (bootstrapping) return bootstrapping;

  bootstrapping = (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await run(`
          CREATE TABLE IF NOT EXISTS classroom_feed_posts (
            id SERIAL PRIMARY KEY,
            class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            post_type VARCHAR(30) NOT NULL DEFAULT 'text',
            body TEXT,
            media_url TEXT,
            media_mime VARCHAR(100),
            voice_duration_sec INTEGER,
            classwork_summary TEXT,
            repost_of_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS post_type VARCHAR(30) DEFAULT 'text'`);
        await run(`UPDATE classroom_feed_posts SET post_type = 'text' WHERE post_type IS NULL`);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS body TEXT`);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS media_url TEXT`);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS media_mime VARCHAR(100)`);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS voice_duration_sec INTEGER`);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS classwork_summary TEXT`);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS repost_of_id INTEGER`);
        await run(`ALTER TABLE classroom_feed_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);

        await run(`
          CREATE TABLE IF NOT EXISTS classroom_feed_likes (
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (post_id, user_id)
          )
        `);
        await run(`
          CREATE TABLE IF NOT EXISTS classroom_feed_comments (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL,
            author_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            parent_comment_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await run(`
          CREATE TABLE IF NOT EXISTS class_co_teachers (
            class_id INTEGER NOT NULL,
            teacher_id INTEGER NOT NULL,
            added_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (class_id, teacher_id)
          )
        `);

        ready = true;
        console.log('[feedSchema] classroom feed tables ready');
        return;
      } catch (err) {
        if (err.code === '40P01' && attempt < 3) {
          console.warn('[feedSchema] deadlock, retry', attempt + 1);
          await sleep(300 * (attempt + 1));
          continue;
        }
        console.error('[feedSchema]', err.message);
        throw err;
      }
    }
  })();

  try {
    await bootstrapping;
  } finally {
    bootstrapping = null;
  }
}

module.exports = { ensureFeedTables };
