#!/usr/bin/env bash
# Run ON VPS as root — restarts the main API (index.js on PORT from .env, usually 3005).
set -euo pipefail
APP_DIR="${1:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
git pull origin main
npm ci --omit=dev

# Stop orphan index.js on 3005 if not managed by PM2
OLD_PID=$(ss -tlnp 2>/dev/null | grep ':3005' | grep -oP 'pid=\K[0-9]+' | head -1 || true)
if [ -n "$OLD_PID" ] && ! pm2 pid studentapi-main 2>/dev/null | grep -q .; then
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
fi

if pm2 describe studentapi-main >/dev/null 2>&1; then
  pm2 restart studentapi-main
else
  pm2 start index.js --name studentapi-main --update-env
fi
pm2 restart school-api 2>/dev/null || true
pm2 save
sleep 2
curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" || curl -fsS http://127.0.0.1:3005/api/health
echo ""
echo "Done. Main API should be on port ${PORT:-3005} (studentapi-main)."
