#!/usr/bin/env bash
# On the VPS: discard local edits to build artifacts and match GitHub main exactly.
set -euo pipefail
git fetch origin main
git checkout main
git reset --hard origin/main
git clean -fd -- student-web-dist/ 2>/dev/null || true
echo "Synced to $(git rev-parse --short HEAD)"
