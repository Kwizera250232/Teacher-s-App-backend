#!/usr/bin/env bash
# Push student-web → Teacher-s-App-frontent (triggers Vercel). Needs FRONTEND_DEPLOY_TOKEN or gh auth with push access.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="${FRONTEND_DIR:-$ROOT/../Teacher-s-App-frontent}"
TOKEN="${FRONTEND_DEPLOY_TOKEN:-${GH_TOKEN:-}}"

if [ ! -d "$ROOT/student-web/src" ]; then
  echo "Missing student-web"
  exit 1
fi

if [ ! -d "$FRONTEND/.git" ]; then
  git clone "https://github.com/Kwizera250232/Teacher-s-App-frontent.git" "$FRONTEND"
fi

echo "Syncing student-web → $FRONTEND"
rm -rf "$FRONTEND/src"
cp -a "$ROOT/student-web/src" "$FRONTEND/"
for f in package.json package-lock.json vite.config.js vercel.json index.html tailwind.config.js postcss.config.js; do
  [ -f "$ROOT/student-web/$f" ] && cp "$ROOT/student-web/$f" "$FRONTEND/"
done
[ -d "$ROOT/student-web/public" ] && rm -rf "$FRONTEND/public" && cp -a "$ROOT/student-web/public" "$FRONTEND/"

cd "$FRONTEND"
npm ci
VITE_API_URL=https://studentapi.umunsi.com/api npm run build

git add -A
if git diff --staged --quiet; then
  echo "No frontend changes to push"
  exit 0
fi

git commit -m "Deploy: square class cards, visible My classes, full UI sync"

if [ -n "$TOKEN" ]; then
  git push "https://x-access-token:${TOKEN}@github.com/Kwizera250232/Teacher-s-App-frontent.git" main
else
  git push origin main
fi

echo "Pushed. Vercel will redeploy https://student.umunsi.com"
