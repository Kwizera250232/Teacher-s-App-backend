#!/bin/bash
set -e

cd /root/Teacher-s-App-frontent

echo "=== Building frontend ==="
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -5

echo "=== Copying uploads ==="
if [ -d /var/www/Teacher-s-App-backend/uploads ]; then
  mkdir -p public/uploads
  cp -r /var/www/Teacher-s-App-backend/uploads/* public/uploads/ 2>/dev/null || true
fi

echo "=== Committing and pushing ==="
git add -A
git commit -m "deploy: alumni feed, groups, onboarding, full alumni platform" || true
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_frontent_deploy' git push origin main

echo "=== Deployed! ==="
echo "Vercel will update in ~2 minutes"
