#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH_SRC="$ROOT/patches/frontend-dashboard-ui/src"
FRONTEND="${1:-}"

if [[ -z "$FRONTEND" ]]; then
  echo "Usage: $0 /path/to/Teacher-s-App-frontent" >&2
  exit 1
fi

if [[ ! -d "$FRONTEND/src" ]]; then
  echo "Not a frontend repo: $FRONTEND" >&2
  exit 1
fi

if [[ ! -d "$PATCH_SRC" ]]; then
  echo "Patch missing at $PATCH_SRC" >&2
  exit 1
fi

cp -R "$PATCH_SRC/components/"* "$FRONTEND/src/components/"
cp -R "$PATCH_SRC/pages/"* "$FRONTEND/src/pages/"
echo "Applied frontend dashboard UI patch to $FRONTEND"
