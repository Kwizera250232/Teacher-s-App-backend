#!/bin/bash
set -e
echo "=== FIX AND DEPLOY ==="

# Fix database tables
echo "=== Creating missing tables ==="
psql -U postgres -d studentapp_db <<'SQL'
CREATE TABLE IF NOT EXISTS alumni_library (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  section TEXT DEFAULT 'Primary Books',
  cover_url TEXT,
  download_url TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS alumni_opportunities (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Scholarships',
  organization TEXT,
  location TEXT,
  deadline DATE,
  link TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS alumni_past_papers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,
  year TEXT,
  pdf_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS alumni_quiz_results (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  quiz_id INTEGER,
  answers JSONB,
  score INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, quiz_id)
);
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS alumni_visible BOOLEAN DEFAULT FALSE;
SQL
echo "=== Tables created ==="

# Restart backend
echo "=== Restarting backend ==="
pm2 restart studentapi-main

echo "=== Done ==="
