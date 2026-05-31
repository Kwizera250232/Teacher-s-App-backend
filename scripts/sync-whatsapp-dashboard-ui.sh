#!/usr/bin/env bash
# Copy PR #5 dashboard UI patch into the Vercel frontend repo, then build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH_SRC="$ROOT/patches/whatsapp-dashboard-ui/src"
FRONTEND_DIR="${1:-$ROOT/../Teacher-s-App-frontent}"

if [ ! -d "$PATCH_SRC" ]; then
  echo "Missing patch: $PATCH_SRC"
  exit 1
fi
if [ ! -d "$FRONTEND_DIR/src" ]; then
  echo "Frontend not found at $FRONTEND_DIR (pass path as first argument)"
  exit 1
fi

echo "Copying $PATCH_SRC -> $FRONTEND_DIR/src/"
cp -r "$PATCH_SRC"/* "$FRONTEND_DIR/src/"
cd "$FRONTEND_DIR"
npm run build
echo "Built. Push $FRONTEND_DIR to main to trigger Vercel, or: npx vercel --prod"
