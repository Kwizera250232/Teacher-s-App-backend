#!/usr/bin/env bash
# Paste into VPS / CloudPanel SSH (root@srv… or Hostinger browser terminal).
# Safe when piped: curl -fsSL .../hostinger-terminal-deploy.sh | bash
set -euo pipefail

REPO_URL="${BACKEND_REPO_URL:-https://github.com/Kwizera250232/Teacher-s-App-backend.git}"

resolve_app_dir() {
  if [[ -n "${BACKEND_APP_DIR:-}" && -f "${BACKEND_APP_DIR}/index.js" ]]; then
    echo "$BACKEND_APP_DIR"
    return 0
  fi
  local d
  for d in \
    "/home/umunsi/htdocs/studentapi.umunsi.com" \
    "/home/studentapi/htdocs/studentapi.umunsi.com" \
    "/var/www/studentapi.umunsi.com" \
    "/home/umunsi/htdocs/studentapi.umunsi.com/public" \
    ; do
    if [[ -f "$d/index.js" ]]; then
      echo "$d"
      return 0
    fi
  done
  if command -v pm2 >/dev/null 2>&1; then
    d="$(pm2 jlist 2>/dev/null | node -e "
      let j=[]; try { j=JSON.parse(require('fs').readFileSync(0,'utf8')); } catch(e) {}
      const names=['studentapi-main','studentapi','school-api'];
      for (const p of j) {
        if (names.includes(p.name) && p.pm2_env && p.pm2_env.pm_cwd) {
          console.log(p.pm2_env.pm_cwd); process.exit(0);
        }
      }
    " 2>/dev/null || true)"
    if [[ -n "$d" && -f "$d/index.js" ]]; then
      echo "$d"
      return 0
    fi
  fi
  local found
  found="$(find /home /var/www -maxdepth 6 -type f -name index.js 2>/dev/null \
    | while read -r f; do
        dir="$(dirname "$f")"
        if [[ -f "$dir/package.json" ]] && grep -q '"name"[[:space:]]*:[[:space:]]*"backend"' "$dir/package.json" 2>/dev/null; then
          echo "$dir"
          break
        fi
      done | head -1)"
  if [[ -n "$found" ]]; then
    echo "$found"
    return 0
  fi
  echo "${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
}

sync_to_main() {
  if [[ -f scripts/git-sync-main.sh ]]; then
    bash scripts/git-sync-main.sh
    return 0
  fi
  echo "==> git-sync-main.sh not found (old checkout) — hard-syncing to origin/main..."
  git fetch origin main
  git checkout main 2>/dev/null || git checkout -B main origin/main
  git reset --hard origin/main
  git clean -fd -- student-web-dist/ 2>/dev/null || true
  echo "Synced to $(git rev-parse --short HEAD)"
}

APP_DIR="$(resolve_app_dir)"
echo "==> Using app directory: $APP_DIR"

if [[ ! -d "$APP_DIR" ]]; then
  echo "==> Cloning repository into $APP_DIR ..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [[ ! -d .git ]]; then
  echo "ERROR: $APP_DIR is not a git repo. Set BACKEND_APP_DIR or clone manually." >&2
  exit 1
fi

echo "==> Syncing to origin/main..."
sync_to_main

echo "==> Installing dependencies..."
npm ci --omit=dev

echo "==> Restarting API (port ${PORT:-3005})..."
SKIP_GIT_SYNC=1 bash scripts/restart-production-api.sh "$APP_DIR"

sleep 4
echo ""
echo "==> Local health on VPS:"
curl -fsS "http://127.0.0.1:${PORT:-3005}/api/health" 2>/dev/null || curl -fsS http://127.0.0.1:3005/api/health
echo ""
echo "==> Inyandiko route (want 401, not 404):"
curl -s -o /dev/null -w "GET /api/classes/inyandiko/dashboard → HTTP %{http_code}\n" \
  "http://127.0.0.1:${PORT:-3005}/api/classes/inyandiko/dashboard" || true
echo ""
if [[ -f scripts/verify-production-api.sh ]]; then
  echo "==> Public API verification:"
  bash scripts/verify-production-api.sh
fi
echo ""
curl -s -o /dev/null -w "/app/ UI HTTP %{http_code}\n" https://studentapi.umunsi.com/app/ 2>/dev/null || true
echo ""
echo "Done. Hard-refresh https://student.umunsi.com → Leaderboard / Dashboard → Inyandiko."
