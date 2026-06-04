#!/usr/bin/env bash
# Emergency VPS deploy — works on CloudPanel / old checkouts without git-sync-main.sh.
# Run on VPS: curl -fsSL .../vps-emergency-deploy.sh | bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"
if [[ -f "$SCRIPT_DIR/hostinger-terminal-deploy.sh" ]]; then
  exec bash "$SCRIPT_DIR/hostinger-terminal-deploy.sh"
fi

# When piped via curl, delegate to hostinger script logic inline
REPO_URL="${BACKEND_REPO_URL:-https://github.com/Kwizera250232/Teacher-s-App-backend.git}"
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"

if [[ ! -f "$APP_DIR/index.js" ]]; then
  found="$(find /home /var/www -maxdepth 6 -type f -name index.js 2>/dev/null \
    | while read -r f; do
        dir="$(dirname "$f")"
        if [[ -f "$dir/package.json" ]] && grep -q '"backend"' "$dir/package.json" 2>/dev/null; then
          echo "$dir"; break
        fi
      done | head -1)"
  [[ -n "$found" ]] && APP_DIR="$found"
fi

echo "==> App dir: $APP_DIR"
[[ -d "$APP_DIR" ]] || { mkdir -p "$(dirname "$APP_DIR")"; git clone "$REPO_URL" "$APP_DIR"; }
cd "$APP_DIR"

git fetch origin main
git checkout main 2>/dev/null || git checkout -B main origin/main
git reset --hard origin/main
echo "==> At commit $(git rev-parse --short HEAD)"

npm ci --omit=dev
SKIP_GIT_SYNC=1 bash scripts/restart-production-api.sh "$APP_DIR"
sleep 3
curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" || true
echo ""
bash scripts/verify-production-api.sh 2>/dev/null || true
echo "Done."
