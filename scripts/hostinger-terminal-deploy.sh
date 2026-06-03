#!/usr/bin/env bash
# Paste into Hostinger SSH terminal (hPanel → VPS → SSH) — deploys API + /app/ UI from GitHub main.
set -euo pipefail
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
cd "$APP_DIR"
echo "==> Pulling latest main..."
git fetch origin main
git checkout main
git pull origin main
echo "==> Installing & restarting API (kills old processes on port 3005)..."
npm ci --omit=dev
bash scripts/restart-production-api.sh "$APP_DIR"
sleep 4
echo ""
echo "==> Local health on VPS:"
curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" 2>/dev/null || curl -fsS http://127.0.0.1:3005/api/health
echo ""
echo "==> Public API verification:"
bash scripts/verify-production-api.sh
echo ""
curl -s -o /dev/null -w "/app/ UI HTTP %{http_code}\n" https://studentapi.umunsi.com/app/
echo ""
echo "Done. Guest marks: Teacher class → Quizzes. Also: Class Now, parent invite linking."
