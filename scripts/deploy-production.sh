#!/usr/bin/env bash
# Run ON the VPS (or via: ssh user@host 'bash -s' < scripts/deploy-production.sh)
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
if [[ -f "$SCRIPT_DIR/cloudpanel-deploy.sh" ]]; then
  exec bash "$SCRIPT_DIR/cloudpanel-deploy.sh"
fi
if [[ -f "$SCRIPT_DIR/hostinger-terminal-deploy.sh" ]]; then
  exec bash "$SCRIPT_DIR/hostinger-terminal-deploy.sh"
fi
if [[ -f scripts/git-sync-main.sh ]]; then
  bash scripts/git-sync-main.sh
else
  git fetch origin main
  git checkout main 2>/dev/null || git checkout -B main origin/main
  git reset --hard origin/main
  git clean -fd -- student-web-dist/ 2>/dev/null || true
fi
npm ci --omit=dev
SKIP_GIT_SYNC=1 bash "$SCRIPT_DIR/restart-production-api.sh" "$APP_DIR"
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
