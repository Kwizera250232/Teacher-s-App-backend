#!/usr/bin/env bash
# Run ON the VPS (or via: ssh user@host 'bash -s' < scripts/deploy-production.sh)
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/var/www/Teacher-s-App-backend}"
cd "$APP_DIR"
git fetch origin main
git checkout main
git pull origin main
npm ci --omit=dev
pm2 restart studentapi || pm2 start index.js --name studentapi
pm2 save
sleep 2
curl -fsS https://studentapi.umunsi.com/api/health
echo ""
curl -s -o /dev/null -w "auth/parent-invite (no token): HTTP %{http_code}\n" -X POST https://studentapi.umunsi.com/api/auth/parent-invite -H "Content-Type: application/json"
curl -s -o /dev/null -w "student-shares/dashboard (no token): HTTP %{http_code}\n" https://studentapi.umunsi.com/api/student-shares/dashboard
echo "Done. Expect parent-invite=401 and dashboard=401 when routes exist (not 404)."
