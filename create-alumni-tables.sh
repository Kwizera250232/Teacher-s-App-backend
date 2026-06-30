#!/bin/bash

# Run SQL as postgres user
sudo -u postgres psql -d studentapp_db << 'SQLEOF'

-- Alumni profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status VARCHAR(20) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_school_or_uni TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_occupation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dream_career TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_subject TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_teacher TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_motto TEXT;

-- Alumni feed
CREATE TABLE IF NOT EXISTS alumni_feed (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_likes (
  id SERIAL PRIMARY KEY,
  feed_id INTEGER NOT NULL REFERENCES alumni_feed(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(feed_id, user_id)
);

CREATE TABLE IF NOT EXISTS alumni_comments (
  id SERIAL PRIMARY KEY,
  feed_id INTEGER NOT NULL REFERENCES alumni_feed(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alumni groups
CREATE TABLE IF NOT EXISTS alumni_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES alumni_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS alumni_group_messages (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES alumni_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alumni compositions
CREATE TABLE IF NOT EXISTS alumni_compositions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  content TEXT,
  status VARCHAR(20) DEFAULT 'published',
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_composition_reactions (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type VARCHAR(20) DEFAULT 'like',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(composition_id, user_id)
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
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alumni follows
CREATE TABLE IF NOT EXISTS alumni_follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Alumni notifications
CREATE TABLE IF NOT EXISTS alumni_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alumni recognitions
CREATE TABLE IF NOT EXISTS alumni_recognitions (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  badge_icon VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alumni rewards
CREATE TABLE IF NOT EXISTS alumni_rewards (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  points INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_reward_claims (
  id SERIAL PRIMARY KEY,
  reward_id INTEGER NOT NULL REFERENCES alumni_rewards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  claimed_at TIMESTAMP DEFAULT NOW()
);

-- Alumni wallet
CREATE TABLE IF NOT EXISTS alumni_wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS alumni_wallet_transactions (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER NOT NULL REFERENCES alumni_wallets(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

SQLEOF

echo "Tables created"
pm2 restart studentapi-main --update-env
sleep 3
echo "Restarted"
