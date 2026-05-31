#!/usr/bin/env bash
# Apply UI to Teacher-s-App-frontent and push (run on your machine with repo write access).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="${1:-../Teacher-s-App-frontent}"
if [ ! -d "$FRONTEND/.git" ]; then
  echo "Clone first: git clone https://github.com/Kwizera250232/Teacher-s-App-frontent.git"
  exit 1
fi
rm -rf "$FRONTEND/src"
cp -a "$ROOT/student-web/src" "$FRONTEND/"
cp "$ROOT/student-web/package.json" "$ROOT/student-web/package-lock.json" \
  "$ROOT/student-web/vite.config.js" "$ROOT/student-web/vercel.json" \
  "$ROOT/student-web/index.html" "$ROOT/student-web/tailwind.config.js" \
  "$ROOT/student-web/postcss.config.js" "$FRONTEND/" 2>/dev/null || true
cd "$FRONTEND"
npm ci
VITE_API_URL=https://studentapi.umunsi.com/api npm run build
git add -A
git commit -m "Deploy: square class cards, Dean AI, desktop/mobile parity" || true
git push origin main
echo "Vercel will redeploy student.umunsi.com from main."
