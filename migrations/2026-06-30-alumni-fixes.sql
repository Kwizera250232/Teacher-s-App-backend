-- Migration: Fix alumni tables and add missing alumni_past_papers
-- Run this on the VPS database before restarting the server

-- Add missing alumni_past_papers table
CREATE TABLE IF NOT EXISTS alumni_past_papers (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(100),
  year INTEGER,
  description TEXT,
  file_url VARCHAR(500),
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_past_papers_subject ON alumni_past_papers(subject);
CREATE INDEX IF NOT EXISTS idx_past_papers_year ON alumni_past_papers(year);

-- Ensure all other alumni tables exist (safe to run multiple times)
CREATE TABLE IF NOT EXISTS graduation_ceremonies (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  ceremony_date DATE,
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_graduation_ceremonies_year ON graduation_ceremonies(year);

CREATE TABLE IF NOT EXISTS alumni_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cover_photo_path VARCHAR(500),
  bio TEXT,
  graduation_year INTEGER,
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  profession VARCHAR(255),
  location VARCHAR(255),
  linkedin_url VARCHAR(500),
  twitter_url VARCHAR(500),
  website_url VARCHAR(500),
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_graduation_year ON alumni_profiles(graduation_year);

CREATE TABLE IF NOT EXISTS alumni_wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reward_balance INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_wallet_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('reward','payout','bonus')),
  amount INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON alumni_wallet_transactions(user_id);

CREATE TABLE IF NOT EXISTS alumni_compositions (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  tags TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','published','rejected')),
  published_at TIMESTAMP,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_compositions_published ON alumni_compositions(published_at);

CREATE TABLE IF NOT EXISTS alumni_composition_reactions (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('like','love','celebrate','support')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(composition_id, user_id, type)
);

CREATE TABLE IF NOT EXISTS alumni_composition_bookmarks (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(composition_id, user_id)
);

CREATE TABLE IF NOT EXISTS alumni_composition_comments (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_composition_comments_composition ON alumni_composition_comments(composition_id);

CREATE TABLE IF NOT EXISTS alumni_composition_rewards (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  awarded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_composition_rewards_user ON alumni_composition_rewards(user_id);

CREATE TABLE IF NOT EXISTS alumni_library_items (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url VARCHAR(500),
  file_type VARCHAR(50),
  category VARCHAR(100),
  subject VARCHAR(100),
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_library_subject ON alumni_library_items(subject);

CREATE TABLE IF NOT EXISTS alumni_library_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES alumni_library_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS alumni_opportunities (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('scholarship','internship','competition','job','volunteer','other')),
  deadline DATE,
  url VARCHAR(500),
  posted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON alumni_opportunities(deadline);

CREATE TABLE IF NOT EXISTS alumni_opportunity_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES alumni_opportunities(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS alumni_follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_alumni_follows_follower ON alumni_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_alumni_follows_following ON alumni_follows(following_id);

CREATE TABLE IF NOT EXISTS alumni_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'follow','reaction','comment','reward','composition_published','group_invite','opportunity'
  )),
  reference_id INTEGER,
  actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_notifications_user ON alumni_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_notifications_read ON alumni_notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS alumni_recognitions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  badge_type VARCHAR(50) NOT NULL CHECK (badge_type IN (
    'student_of_month','best_writer','most_helpful','top_mentor',
    'top_reader','top_contributor','top_volunteer','weekly_ranking',
    'monthly_ranking','annual_award','verified_alumni'
  )),
  awarded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  period VARCHAR(20),
  description TEXT,
  awarded_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recognitions_user ON alumni_recognitions(user_id);
CREATE INDEX IF NOT EXISTS idx_recognitions_badge ON alumni_recognitions(badge_type);

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

CREATE TABLE IF NOT EXISTS alumni_feed_posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  image_paths TEXT[],
  post_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (post_type IN ('text','image','composition_link','achievement')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_posts_author ON alumni_feed_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON alumni_feed_posts(created_at);

CREATE TABLE IF NOT EXISTS alumni_feed_likes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS alumni_feed_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post ON alumni_feed_comments(post_id);

-- Ensure users table has alumni columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status VARCHAR(20) DEFAULT 'active';
