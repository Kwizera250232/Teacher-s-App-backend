#!/bin/bash
set -e

echo "=== DEPLOY FIXES TO studentapi.umunsi.com ==="
echo ""

# 1. Commit and push all fixes
echo "[1/5] Committing and pushing fixes to git..."
cd "$(dirname "$0")/backend"

git add -A
git commit -m "fix: alumni pool import, missing past_papers table, alumniSchema, Gemini API migration" || echo "Nothing to commit"
git push origin master || git push origin main

echo ""
echo "[2/5] SSH to VPS and pull latest code..."
echo "Run these commands on your VPS:"
echo ""
echo "  cd /path/to/Teacher-s-App-backend"
echo "  git fetch origin"
echo "  git checkout master  # or: git checkout main"
echo "  git pull origin master  # or: git pull origin main"
echo ""
echo "[3/5] Install dependencies (removes groq-sdk, no new deps)..."
echo "  npm install"
echo ""
echo "[4/5] Run database migration..."
echo "  psql \"\$DATABASE_URL\" -f migrations/2026-06-30-alumni-fixes.sql"
echo ""
echo "[5/5] Update .env with new Gemini API key and restart..."
echo "  # Edit .env and replace GROQ_API_KEY with:"
echo "  GEMINI_API_KEY=your-gemini-api-key-here"
echo "  # Remove or comment out GROQ_API_KEY line"
echo ""
echo "  pm2 restart studentapi-main"
echo ""
echo "=== VERIFY ==="
echo "  curl https://studentapi.umunsi.com/api/health"
echo "  pm2 logs studentapi-main --lines 20"
echo ""
echo "=== FIXES APPLIED ==="
echo "1. alumni.js & alumni-social.js: Fixed pool import (was undefined, broke ALL alumni routes)"
echo "2. schema.sql: Added missing alumni_past_papers table"
echo "3. alumniSchema.js: Fixed multi-line SQL execution (was line-by-line, no tables created)"
echo "4. ai.js: Replaced Groq SDK (out of quota) with Gemini REST API"
echo "5. package.json: Removed groq-sdk dependency"
