#!/usr/bin/env bash
# Run ON VPS as root — restarts the main API (index.js on PORT from .env, usually 3005).
set -euo pipefail
APP_DIR="${1:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
git pull origin main
npm ci --omit=dev

PORT="${PORT:-3005}"
pm2 delete studentapi 2>/dev/null || true

# Always free the API port — orphan node processes survive pm2 restart and serve stale code
while read -r pid; do
  [ -n "$pid" ] || continue
  echo "Stopping process $pid on port $PORT"
  kill -9 "$pid" 2>/dev/null || true
done < <(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' || true)
sleep 1

if pm2 describe studentapi-main >/dev/null 2>&1; then
  pm2 delete studentapi-main 2>/dev/null || true
fi
pm2 start index.js --name studentapi-main --cwd "$APP_DIR" --update-env
pm2 restart school-api 2>/dev/null || true
pm2 save
sleep 2
curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" || curl -fsS http://127.0.0.1:3005/api/health
echo ""
echo "Done. Main API should be on port ${PORT:-3005} (studentapi-main)."
