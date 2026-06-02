#!/usr/bin/env bash
# Paste into Hostinger SSH terminal (hPanel → VPS → SSH) — deploys API + /app/ UI from GitHub main.
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
echo "==> Pulling latest main..."
git fetch origin main
git checkout main
git pull origin main
echo "==> Installing & restarting API..."
npm ci --omit=dev
bash scripts/restart-production-api.sh "$APP_DIR"
sleep 3
echo ""
echo "==> Health (build should match: $(git rev-parse --short HEAD)):"
curl -fsS https://studentapi.umunsi.com/api/health
echo ""
REACT_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST https://studentapi.umunsi.com/api/class-moments/1/react -H 'Content-Type: application/json' -d '{"emoji":"like"}')"
echo "class-moments/react HTTP $REACT_CODE (want 401, not 404)"
echo ""
curl -s -o /dev/null -w "/app/ UI HTTP %{http_code}\n" https://studentapi.umunsi.com/app/
echo ""
echo "Done. Open https://studentapi.umunsi.com/app/ → Teacher → Class Now"
echo "For student.umunsi.com (Vercel), push Teacher-s-App-frontent after this."
