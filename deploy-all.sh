#!/bin/bash
set -e

echo "=== Restarting backend ==="
pm2 restart studentapi-main --update-env
sleep 2

echo "=== Building frontend ==="
cd /root/Teacher-s-App-frontent
npm run build 2>&1 | tail -3

echo "=== Pushing to GitHub ==="
git add -A
git commit -m 'fix: alumni join changes role to alumni + updates token immediately' || true
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_frontent_deploy' git push origin main

echo "=== Done ==="
