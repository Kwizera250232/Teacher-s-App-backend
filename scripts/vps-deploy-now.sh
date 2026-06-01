#!/usr/bin/env bash
# Run ON the VPS (Hostinger SSH terminal). Pulls latest main + restarts API + verifies C. Status routes.
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
echo "==> Pulling main..."
git fetch origin main
git checkout main
git pull origin main
echo "==> Installing dependencies..."
npm ci --omit=dev
echo "==> Restarting API..."
bash scripts/restart-production-api.sh "$APP_DIR"
sleep 3
echo "==> Health (local):"
curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" || curl -fsS http://127.0.0.1:3005/api/health
echo ""
echo "==> Health (public):"
curl -fsS https://studentapi.umunsi.com/api/health
echo ""
FEED_CODE="$(curl -s -o /dev/null -w '%{http_code}' https://studentapi.umunsi.com/api/composition-status/feed)"
echo "composition-status/feed HTTP $FEED_CODE (want 401, not 404)"
echo "UI bundle: https://studentapi.umunsi.com/app/"
