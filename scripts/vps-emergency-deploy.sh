#!/usr/bin/env bash
# Emergency VPS deploy when git pull fails (local student-web-dist changes).
# Run on Hostinger SSH: curl -fsSL .../vps-emergency-deploy.sh | bash
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
echo "==> App dir: $APP_DIR"
git fetch origin main
git checkout main
git reset --hard origin/main
echo "==> At commit $(git rev-parse --short HEAD)"
npm ci --omit=dev
PORT="${PORT:-3005}"
pm2 delete studentapi 2>/dev/null || true
pm2 delete studentapi-main 2>/dev/null || true
pkill -f "${APP_DIR}/index.js" 2>/dev/null || true
while read -r pid; do
  [ -n "$pid" ] || continue
  kill -9 "$pid" 2>/dev/null || true
done < <(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' || true)
sleep 2
git rev-parse HEAD > VERSION 2>/dev/null || true
pm2 start index.js --name studentapi-main --cwd "$APP_DIR" --update-env
pm2 save
sleep 3
echo "==> Local health:"
curl -fsS "http://127.0.0.1:${PORT}/api/health" || true
echo ""
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/classes/1/guest-marks")"
echo "guest-marks (no auth): HTTP $CODE (want 401, not 404)"
if [ "$CODE" = "404" ]; then
  echo "ERROR: API still missing guest-marks route. Check APP_DIR and pm2 logs." >&2
  exit 1
fi
if [ -f scripts/verify-production-api.sh ]; then
  bash scripts/verify-production-api.sh
fi
echo "Done. Hard-refresh student.umunsi.com → class Quizzes tab."
