#!/bin/bash
BACKEND=/root/Teacher-s-App-frontent/Teacher-s-App-backend

# Add mount line to index.js after alumni-compositions
sed -i "/app.use('\/api\/alumni', require('.\/routes\/alumni-compositions'));/a app.use('/api/alumni', require('./routes/alumni-social'));" $BACKEND/index.js

# Create tables
cat > /tmp/alumni-tables.sql << 'SQLEOF'
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
SQLEOF

psql -U postgres -d studentapp_db -f /tmp/alumni-tables.sql

# Restart
pm2 restart studentapi-main --update-env
sleep 2

curl -s -o /dev/null -w '%{http_code}' http://localhost:3005/api/alumni/feed
echo ' feed'
curl -s -o /dev/null -w '%{http_code}' http://localhost:3005/api/alumni/groups
echo ' groups'
