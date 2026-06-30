#!/bin/bash
set -e

BACKEND=/root/Teacher-s-App-frontent/Teacher-s-App-backend
FRONTEND=/root/Teacher-s-App-frontent

# 1. Append extra routes to alumni.js
echo "=== Adding extra backend routes ==="
cat /tmp/alumni-extra-routes.js >> $BACKEND/routes/alumni.js

# 2. Create missing tables
echo "=== Creating database tables ==="
PGPASSWORD=postgres psql -U postgres -d studentapp_db <<'EOF'
CREATE TABLE IF NOT EXISTS alumni_books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  section TEXT DEFAULT 'Primary Books',
  file_url TEXT,
  cover_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_past_papers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,
  year TEXT,
  file_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_direct_messages (
  id SERIAL PRIMARY KEY,
  from_user_id INTEGER REFERENCES users(id),
  to_user_id INTEGER REFERENCES users(id),
  content TEXT,
  image_path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_dean_quizzes (
  id SERIAL PRIMARY KEY,
  title TEXT,
  category TEXT,
  question_count INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_dean_questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER REFERENCES alumni_dean_quizzes(id),
  question TEXT,
  options JSONB,
  correct_answer TEXT
);

CREATE TABLE IF NOT EXISTS alumni_dean_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  quiz_id INTEGER REFERENCES alumni_dean_quizzes(id),
  answers JSONB,
  score INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
EOF

echo "=== Tables created ==="

# 3. Restart backend
echo "=== Restarting backend ==="
pm2 restart studentapi-main --update-env

# 4. Build frontend
echo "=== Building frontend ==="
cd $FRONTEND
npm run build 2>&1 | tail -5

# 5. Push to GitHub
echo "=== Pushing to GitHub ==="
git add -A
git commit -m 'feat: complete alumni platform - notes, quizzes, homework, library, past papers, colleagues chat, dean AI, responsive layout' || true
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_frontent_deploy' git push origin main

echo "=== DONE ==="
