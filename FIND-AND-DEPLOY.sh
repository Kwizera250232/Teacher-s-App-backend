#!/bin/bash
# Find and Deploy Script - Run this on your VPS

echo "=== FINDING REPOSITORIES ==="
echo ""

# Find backend directory
echo "Searching for backend..."
BACKEND_DIR=$(find ~ -type d -name "Teacher-s-App-backend" 2>/dev/null | head -1)
echo "Backend found: $BACKEND_DIR"

# Find frontend directory
echo "Searching for frontend..."
FRONTEND_DIR=$(find ~ -type d -name "Teacher-s-App-frontent" 2>/dev/null | head -1)
echo "Frontend found: $FRONTEND_DIR"

echo ""
echo "=== UPDATING BACKEND ==="
cd "$BACKEND_DIR" || { echo "Cannot access backend dir"; exit 1; }
git checkout master
git pull origin master
npm install
pm2 restart studentapi-main

echo ""
echo "=== UPDATING FRONTEND ==="
cd "$FRONTEND_DIR" || { echo "Cannot access frontend dir"; exit 1; }
git checkout master
git add .
git commit -m "fix: update Vercel configuration and auth flow"
git push origin master

echo ""
echo "=== VERIFYING ==="
curl https://studentapi.umunsi.com/api/health
