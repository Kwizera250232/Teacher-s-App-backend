#!/usr/bin/env bash
# UClass API deploy for CloudPanel / Hostinger VPS.
# Paste: curl -fsSL https://raw.githubusercontent.com/Kwizera250232/Teacher-s-App-backend/main/scripts/cloudpanel-deploy.sh | bash
set -euo pipefail

REPO_URL="${BACKEND_REPO_URL:-https://github.com/Kwizera250232/Teacher-s-App-backend.git}"
PORT="${PORT:-3005}"

find_running_api_dir() {
  local pid cwd
  pid="$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  if [[ -n "$pid" && -d "/proc/$pid" ]]; then
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    if [[ -n "$cwd" && -f "$cwd/index.js" ]]; then
      echo "$cwd"
      return 0
    fi
  fi
  return 1
}

resolve_app_dir() {
  if [[ -n "${BACKEND_APP_DIR:-}" && -f "${BACKEND_APP_DIR}/index.js" ]]; then
    echo "$BACKEND_APP_DIR"
    return 0
  fi
  local d
  if d="$(find_running_api_dir)"; then
    echo "$d"
    return 0
  fi
  if command -v pm2 >/dev/null 2>&1; then
    d="$(pm2 jlist 2>/dev/null | node -e "
      let j=[]; try { j=JSON.parse(require('fs').readFileSync(0,'utf8')); } catch(e) {}
      for (const p of j) {
        const cwd=p.pm2_env && p.pm2_env.pm_cwd;
        if (cwd && /studentapi|school-api|studentapi-main|studentapi-main/i.test(p.name||'')) {
          console.log(cwd); process.exit(0);
        }
      }
      for (const p of j) {
        const cwd=p.pm2_env && p.pm2_env.pm_cwd;
        if (cwd && (p.name==='studentapi-main'||p.name==='studentapi'||p.name==='school-api')) {
          console.log(cwd); process.exit(0);
        }
      }
    " 2>/dev/null || true)"
    if [[ -n "$d" && -f "$d/index.js" ]]; then
      echo "$d"
      return 0
    fi
  fi
  for d in \
    "/home/umunsi/htdocs/studentapi.umunsi.com" \
    "/home/studentapi/htdocs/studentapi.umunsi.com" \
    "/var/www/studentapi.umunsi.com" \
    ; do
    if [[ -f "$d/index.js" ]]; then
      echo "$d"
      return 0
    fi
  done
  found="$(find /home /var/www -maxdepth 8 -type f -name index.js 2>/dev/null \
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
  echo "/home/umunsi/htdocs/studentapi.umunsi.com"
}

sync_to_main() {
  echo "==> Fetching latest main from GitHub..."
  git fetch origin main
  git checkout main 2>/dev/null || git checkout -B main origin/main
  git reset --hard origin/main
  git clean -fd -- student-web-dist/ 2>/dev/null || true
  echo "==> Synced to $(git rev-parse --short HEAD)"
}

restart_api() {
  echo "==> Restarting API on port ${PORT}..."
  pm2 delete studentapi 2>/dev/null || true
  pm2 delete studentapi-main 2>/dev/null || true
  pkill -f "${APP_DIR}/index.js" 2>/dev/null || true
  local pid
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    kill -9 "$pid" 2>/dev/null || true
  done < <(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' || true)
  sleep 2
  git rev-parse HEAD > VERSION 2>/dev/null || true
  pm2 start index.js --name studentapi-main --cwd "$APP_DIR" --update-env
  pm2 restart school-api 2>/dev/null || true
  pm2 save 2>/dev/null || true
}

APP_DIR="$(resolve_app_dir)"
echo "==> App directory: $APP_DIR"

if [[ ! -d "$APP_DIR" ]]; then
  echo "==> Cloning into $APP_DIR ..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [[ ! -d .git ]]; then
  echo "ERROR: $APP_DIR is not a git repository." >&2
  exit 1
fi

sync_to_main
echo "==> npm install..."
npm ci --omit=dev
restart_api

sleep 4
echo ""
echo "==> Local health:"
curl -fsS "http://127.0.0.1:${PORT}/api/health"
echo ""
echo "==> Inyandiko (want 401, not 404):"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1:${PORT}/api/classes/inyandiko/dashboard"
echo "==> Quiz teacher shares (want 401, not 404):"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1:${PORT}/api/quiz-teacher-shares/colleagues"
echo ""
echo "==> Public health:"
curl -fsS "https://studentapi.umunsi.com/api/health"
echo ""
curl -s -o /dev/null -w "Public inyandiko: HTTP %{http_code}\n" "https://studentapi.umunsi.com/api/classes/inyandiko/dashboard"
echo ""
echo "Done. Hard-refresh https://student.umunsi.com"
