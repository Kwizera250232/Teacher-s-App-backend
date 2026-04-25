#!/bin/bash
set -e

# ──────────────────────────────────────────────
# 1. Create PostgreSQL user and database
#    DB: studentapp_db  (unique – does not clash with other apps)
# ──────────────────────────────────────────────
sudo -u postgres psql << 'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'studentapp_user') THEN
    CREATE USER studentapp_user WITH PASSWORD 'KWIZERA783450859@k';
  END IF;
END $$;
CREATE DATABASE studentapp_db OWNER studentapp_user;
GRANT ALL PRIVILEGES ON DATABASE studentapp_db TO studentapp_user;
\l
SQL

# ──────────────────────────────────────────────
# 2. Backend  →  api.student.umunsi.com  (port 3005)
#    Home: /home/umunsi/htdocs/api.student.umunsi.com
# ──────────────────────────────────────────────
BACKEND_DIR=/home/umunsi/htdocs/studentapi.umunsi.com
mkdir -p "$BACKEND_DIR"
cd "$BACKEND_DIR"
rm -rf * .gitignore .env 2>/dev/null
git clone https://github.com/Kwizera250232/Teacher-s-App-backend.git .
npm install

cat > .env << 'ENV'
PORT=3005
DATABASE_URL=postgresql://studentapp_user:KWIZERA783450859@k@localhost:5432/studentapp_db
JWT_SECRET=eduapp_super_secret_jwt_2026_kwizera_change_in_prod
ENV


# Run schema to create tables
node initDb.js

# Start with PM2
pm2 delete student-app-api 2>/dev/null || true
pm2 start index.js --name student-app-api --cwd "$BACKEND_DIR"
pm2 save

echo "=== STUDENT APP BACKEND DONE ==="
echo "Frontend is on Vercel – set VITE_API_URL=https://studentapi.umunsi.com/api in Vercel environment variables"
