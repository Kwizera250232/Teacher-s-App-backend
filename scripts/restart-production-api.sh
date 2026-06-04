#!/usr/bin/env bash
# Run ON VPS as root — restarts the main API (index.js on PORT from .env, usually 3005).
set -euo pipefail
APP_DIR="${1:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
# Skip second pull when hostinger-terminal-deploy.sh already synced.
if [[ "${SKIP_GIT_SYNC:-}" != "1" ]]; then
  if [[ -f scripts/git-sync-main.sh ]]; then
    bash scripts/git-sync-main.sh
  else
    echo "==> git-sync-main.sh missing — syncing inline..."
    git fetch origin main
    git checkout main 2>/dev/null || git checkout -B main origin/main
    git reset --hard origin/main
    git clean -fd -- student-web-dist/ 2>/dev/null || true
    echo "Synced to $(git rev-parse --short HEAD)"
  fi
fi
npm ci --omit=dev

PORT="${PORT:-3005}"
pm2 delete studentapi 2>/dev/null || true
pm2 delete studentapi-main 2>/dev/null || true

# Orphans on :3005 survive "pm2 restart" and keep serving old code — stop them all first
pkill -f "${APP_DIR}/index.js" 2>/dev/null || true
while read -r pid; do
  [ -n "$pid" ] || continue
  echo "Stopping process $pid on port $PORT"
  kill -9 "$pid" 2>/dev/null || true
done < <(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' || true)
sleep 2

git rev-parse HEAD > VERSION 2>/dev/null || true
pm2 start index.js --name studentapi-main --cwd "$APP_DIR" --update-env
pm2 restart school-api 2>/dev/null || true
pm2 save
sleep 2
curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" || curl -fsS http://127.0.0.1:3005/api/health
echo ""
echo "Done. Main API should be on port ${PORT:-3005} (studentapi-main)."
