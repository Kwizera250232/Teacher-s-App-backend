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
check_route() {
  local label="$1"
  shift
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  echo "${label}: HTTP ${code}"
  if [ "$code" = "404" ]; then
    echo "  ERROR: route missing — run git pull on the server and pm2 restart studentapi"
    FAILED=1
  fi
}

FAILED=0
check_route "auth/parent-invite POST" -X POST https://studentapi.umunsi.com/api/auth/parent-invite -H "Content-Type: application/json"
check_route "parent/my/parent-invite POST" -X POST https://studentapi.umunsi.com/api/parent/my/parent-invite -H "Content-Type: application/json"
check_route "composition-status/mine GET" https://studentapi.umunsi.com/api/composition-status/mine
check_route "student-shares/dashboard GET" https://studentapi.umunsi.com/api/student-shares/dashboard
echo "Done. Expect 401 (no token) or 403 (bad token), never 404."
exit "${FAILED:-0}"
