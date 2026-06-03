#!/usr/bin/env bash
# Run ON the VPS (or via: ssh user@host 'bash -s' < scripts/deploy-production.sh)
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
bash "$(dirname "$0")/git-sync-main.sh"
npm ci --omit=dev
bash "$(dirname "$0")/restart-production-api.sh" "$APP_DIR"
pm2 save
sleep 2
curl -fsS https://studentapi.umunsi.com/api/health
echo ""
curl -s -o /dev/null -w "student UI /app/: HTTP %{http_code}\n" https://studentapi.umunsi.com/app/
echo ""
curl -s -o /dev/null -w "auth/parent-invite (no token): HTTP %{http_code}\n" -X POST https://studentapi.umunsi.com/api/auth/parent-invite -H "Content-Type: application/json"
curl -s -o /dev/null -w "student-shares/dashboard (no token): HTTP %{http_code}\n" https://studentapi.umunsi.com/api/student-shares/dashboard
curl -s -o /dev/null -w "class-moments/react (no token): HTTP %{http_code}\n" -X POST https://studentapi.umunsi.com/api/class-moments/1/react -H "Content-Type: application/json" -d '{"emoji":"like"}'
curl -s -o /dev/null -w "guest-marks (no token): HTTP %{http_code}\n" https://studentapi.umunsi.com/api/classes/1/guest-marks
curl -s -o /dev/null -w "parent/accept-invite (no token): HTTP %{http_code}\n" -X POST https://studentapi.umunsi.com/api/parent/accept-invite -H 'Content-Type: application/json' -d '{}'
bash "$(dirname "$0")/verify-production-api.sh"
