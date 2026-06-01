#!/usr/bin/env bash
# Build frontend and copy into student-web-dist/ for API server static hosting at /app/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="${FRONTEND_DIR:-$ROOT/student-web}"
if [ ! -f "$FRONTEND/package.json" ]; then
  FRONTEND="$ROOT/frontend"
fi
if [ ! -f "$FRONTEND/package.json" ]; then
  echo "Frontend not found (tried student-web/ and frontend/)"
  exit 1
fi
cd "$FRONTEND"
npm ci
VITE_BASE_PATH=/app/ npm run build
rm -rf "$ROOT/student-web-dist"
cp -a dist "$ROOT/student-web-dist"
git -C "$ROOT" rev-parse HEAD > "$ROOT/VERSION" 2>/dev/null || date -u +%Y%m%d-%H%M%S > "$ROOT/VERSION"
echo "Built → $ROOT/student-web-dist (serve at https://studentapi.umunsi.com/app/)"
