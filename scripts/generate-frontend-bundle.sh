#!/usr/bin/env bash
# Build a git bundle to update Teacher-s-App-frontent without a PAT (run on VPS or machine with push access).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/frontend-bundle-build"
BUNDLE="${ROOT}/patches/frontend-vercel-deploy/frontend-deploy.bundle"
SRC="$ROOT/student-web"

rm -rf "$WORK"
git clone --depth 1 "https://github.com/Kwizera250232/Teacher-s-App-frontent.git" "$WORK"
rm -rf "$WORK/src"
cp -a "$SRC/src" "$WORK/"
for f in package.json package-lock.json vite.config.js vercel.json index.html tailwind.config.js postcss.config.js; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$WORK/"
done
[ -d "$SRC/public" ] && rm -rf "$WORK/public" && cp -a "$SRC/public" "$WORK/public"

cd "$WORK"
git add -A
git commit -m "Deploy: sync student-web from Teacher-s-App-backend $(date -u +%Y-%m-%d)" || true
mkdir -p "$(dirname "$BUNDLE")"
git bundle create "$BUNDLE" HEAD
echo "Created $BUNDLE"
echo "On a machine with push access to Teacher-s-App-frontent:"
echo "  cd /path/to/Teacher-s-App-frontent && git pull $BUNDLE main && git push origin main"
