-- Alumni feed tables
CREATE TABLE IF NOT EXISTS alumni_feed_posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  content TEXT NOT NULL,
  media_url TEXT,
  likes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_feed_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES alumni_feed_posts(id),
  user_id INTEGER REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_feed_likes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES alumni_feed_posts(id),
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Add profile photo column
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_photo_path TEXT;

-- Insert the existing post
INSERT INTO alumni_feed_posts (id, user_id, content, media_url, likes, comments_count, shares, created_at)
VALUES (2, 139, '## The Final Sprint...', 'https://images.unsplash.com/photo-1523240794352-664cff7b37b9?w=1200&q=80', 0, 0, 0, '2026-06-27T10:43:06.591Z')
ON CONFLICT (id) DO NOTHING;
