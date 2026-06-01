#!/usr/bin/env bash
# Deploy main to production VPS over SSH. Requires SSH_HOST, SSH_USER, SSH_PRIVATE_KEY.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="$("$ROOT/scripts/normalize-ssh-host.sh" "${SSH_HOST:-}")"
USER="${SSH_USER:-root}"
PORT="${SSH_PORT:-22}"
APP_DIR="${BACKEND_APP_DIR:-/home/umunsi/htdocs/studentapi.umunsi.com}"
KEY_FILE="${SSH_KEY_FILE:-}"

if [[ -z "${SSH_PRIVATE_KEY:-}" && -z "$KEY_FILE" ]]; then
  echo "ERROR: Set SSH_PRIVATE_KEY or SSH_KEY_FILE to deploy." >&2
  echo "  GitHub: add secrets SSH_HOST, SSH_USER, SSH_PRIVATE_KEY then re-run Finish deploy workflow." >&2
  exit 1
fi

if [[ -n "${SSH_PRIVATE_KEY:-}" ]]; then
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  printf '%s\n' "$SSH_PRIVATE_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi

echo "Deploying to ${USER}@${HOST}:${PORT} → ${APP_DIR}"
ssh -o StrictHostKeyChecking=accept-new -p "$PORT" -i "$KEY_FILE" "${USER}@${HOST}" bash -s <<EOF
set -e
cd "$APP_DIR"
git fetch origin main
git checkout main
git pull origin main
npm ci --omit=dev
bash scripts/restart-production-api.sh "$APP_DIR"
curl -fsS http://127.0.0.1:\${PORT:-3005}/api/health || curl -fsS http://127.0.0.1:3005/api/health
EOF

echo ""
echo "Public health:"
curl -fsS "https://studentapi.umunsi.com/api/health"
echo ""
curl -s -o /dev/null -w "composition-status/feed → HTTP %{http_code}\n" "https://studentapi.umunsi.com/api/composition-status/feed"
