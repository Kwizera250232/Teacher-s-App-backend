-- Migration: Create all alumni social tables if missing
-- Run on VPS: psql $DATABASE_URL -f 2026-07-03-alumni-social-tables.sql

-- Direct messages table
CREATE TABLE IF NOT EXISTS alumni_direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  image_path VARCHAR(500),
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adm_sender ON alumni_direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_adm_receiver ON alumni_direct_messages(receiver_id);

-- Feed posts
CREATE TABLE IF NOT EXISTS alumni_feed_posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  image_paths TEXT[],
  post_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (post_type IN ('text','image','composition_link','achievement')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_posts_author ON alumni_feed_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON alumni_feed_posts(created_at);

-- Feed likes
CREATE TABLE IF NOT EXISTS alumni_feed_likes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Feed comments
CREATE TABLE IF NOT EXISTS alumni_feed_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post ON alumni_feed_comments(post_id);

-- Feed views
CREATE TABLE IF NOT EXISTS alumni_feed_views (
  post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_views_post ON alumni_feed_views(post_id);

-- Feed reactions
CREATE TABLE IF NOT EXISTS alumni_feed_reactions (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Stories
CREATE TABLE IF NOT EXISTS alumni_stories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  background_color VARCHAR(20) DEFAULT '#7c3aed',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_stories_user ON alumni_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_stories_expires ON alumni_stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_alumni_stories_active ON alumni_stories(expires_at) WHERE expires_at > NOW();

-- Story views
CREATE TABLE IF NOT EXISTS alumni_story_views (
  story_id INTEGER NOT NULL REFERENCES alumni_stories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

-- Groups
CREATE TABLE IF NOT EXISTS alumni_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_path VARCHAR(500),
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT TRUE,
  member_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_groups_creator ON alumni_groups(creator_id);

-- Group members
CREATE TABLE IF NOT EXISTS alumni_group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES alumni_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON alumni_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON alumni_group_members(user_id);

-- Group messages
CREATE TABLE IF NOT EXISTS alumni_group_messages (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES alumni_groups(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  image_path VARCHAR(500),
  message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','composition','file')),
  reply_to_id INTEGER REFERENCES alumni_group_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON alumni_group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created ON alumni_group_messages(created_at);

-- Follows
CREATE TABLE IF NOT EXISTS alumni_follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_alumni_follows_follower ON alumni_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_alumni_follows_following ON alumni_follows(following_id);

-- Notifications
CREATE TABLE IF NOT EXISTS alumni_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('follow','reaction','comment','reward','composition_published','group_invite','opportunity')),
  reference_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_notifications_user ON alumni_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_notifications_read ON alumni_notifications(user_id, is_read);

-- Recognitions
CREATE TABLE IF NOT EXISTS alumni_recognitions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  badge_type VARCHAR(50) NOT NULL CHECK (badge_type IN ('student_of_month','best_writer','most_helpful','top_mentor','top_reader','top_contributor','top_volunteer','weekly_ranking','monthly_ranking','annual_award','verified_alumni')),
  awarded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  period VARCHAR(20),
  description TEXT,
  awarded_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE alumni_recognitions ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recognitions_user ON alumni_recognitions(user_id);
CREATE INDEX IF NOT EXISTS idx_recognitions_badge ON alumni_recognitions(badge_type);

-- Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status VARCHAR(20) DEFAULT 'active';
