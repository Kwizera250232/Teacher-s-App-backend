#!/usr/bin/env bash
# Sync student-web → build → push Teacher-s-App-frontent OR deploy with VERCEL_TOKEN.
# Usage:
#   FRONTEND_DEPLOY_TOKEN=ghp_xxx bash scripts/deploy-vercel-frontend.sh
#   VERCEL_TOKEN=xxx bash scripts/deploy-vercel-frontend.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/teacher-frontent-deploy"
SRC="$ROOT/student-web"
SCOPE="${VERCEL_SCOPE:-kwizera-jean-de-dieus-projects}"

rm -rf "$WORK"
mkdir -p "$WORK"
rsync -a --exclude=node_modules "$SRC/" "$WORK/"
cd "$WORK"
npm ci
VITE_API_URL="${VITE_API_URL:-https://studentapi.umunsi.com/api}" npm run build

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  echo "Deploying to Vercel (scope=$SCOPE)..."
  npx vercel@latest deploy --prod --yes \
    --token "$VERCEL_TOKEN" \
    --scope "$SCOPE" \
    --name teacher-s-app-frontent
  echo "Done. Check https://student.umunsi.com"
  exit 0
fi

FRONTEND="${FRONTEND_DIR:-$ROOT/../Teacher-s-App-frontent}"
if [[ ! -d "$FRONTEND/.git" ]]; then
  git clone "https://github.com/Kwizera250232/Teacher-s-App-frontent.git" "$FRONTEND"
fi
rsync -a --delete "$WORK/src/" "$FRONTEND/src/"
for f in package.json package-lock.json vite.config.js vercel.json index.html tailwind.config.js postcss.config.js; do
  [[ -f "$WORK/$f" ]] && cp "$WORK/$f" "$FRONTEND/"
done
[[ -d "$WORK/public" ]] && rsync -a --delete "$WORK/public/" "$FRONTEND/public/"
[[ -d "$WORK/dist" ]] && rsync -a "$WORK/dist/" "$FRONTEND/dist/"
cd "$FRONTEND"
git add -A
git diff --staged --quiet && { echo "No changes to push"; exit 0; }
git commit -m "Deploy: sync UI from Teacher-s-App-backend student-web"
TOKEN="${FRONTEND_DEPLOY_TOKEN:-${GH_TOKEN:-}}"
if [[ -n "$TOKEN" ]]; then
  git push "https://x-access-token:${TOKEN}@github.com/Kwizera250232/Teacher-s-App-frontent.git" main
else
  git push origin main
fi
echo "Pushed. Vercel will redeploy https://student.umunsi.com (Git must be connected in Vercel project)."
