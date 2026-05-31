#!/usr/bin/env bash
# Sync student-web → Teacher-s-App-frontent and push (triggers Vercel).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="${1:-$ROOT/../Teacher-s-App-frontent}"
SRC="$ROOT/student-web"

if [ ! -d "$SRC/src" ]; then
  echo "Missing $SRC"
  exit 1
fi
if [ ! -d "$FRONTEND/.git" ]; then
  echo "Cloning frontend..."
  git clone "https://github.com/Kwizera250232/Teacher-s-App-frontent.git" "$FRONTEND"
fi

echo "Syncing $SRC → $FRONTEND"
rm -rf "$FRONTEND/src"
cp -a "$SRC/src" "$FRONTEND/"
cp "$SRC/package.json" "$SRC/package-lock.json" "$SRC/vite.config.js" "$SRC/vercel.json" \
  "$SRC/index.html" "$SRC/tailwind.config.js" "$SRC/postcss.config.js" "$FRONTEND/" 2>/dev/null || true
[ -d "$SRC/public" ] && rm -rf "$FRONTEND/public" && cp -a "$SRC/public" "$FRONTEND/"

cd "$FRONTEND"
npm ci
VITE_API_URL=https://studentapi.umunsi.com/api npm run build
git add -A
git diff --staged --quiet && echo "No changes" && exit 0
git commit -m "Deploy: sync full UI from Teacher-s-App-backend student-web"
git push origin main
echo "Pushed. Vercel will redeploy https://student.umunsi.com"
