#!/usr/bin/env bash
# Run ON THE VPS (SSH as root or umunsi) — deploys Class Moments API + /app/ UI
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
echo "==> Pull latest main (includes Class Now / class-moments)"
git fetch origin main
git checkout main
git pull origin main
npm ci --omit=dev
bash scripts/restart-production-api.sh "$APP_DIR"
sleep 2
echo ""
echo "==> Health (build should match git rev-parse HEAD):"
curl -fsS https://studentapi.umunsi.com/api/health
echo ""
echo "==> Class Moments route (expect 401 without login, NOT 404):"
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://studentapi.umunsi.com/api/class-moments/preview
echo ""
echo "==> Student UI bundle:"
curl -s -o /dev/null -w "/app/ HTTP %{http_code}\n" https://studentapi.umunsi.com/app/
echo ""
echo "Open https://studentapi.umunsi.com/app/ — teacher tab: Class Now"
echo "For student.umunsi.com (Vercel), run frontend push from a machine with repo access (see DEPLOY.md)."
