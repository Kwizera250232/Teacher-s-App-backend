#!/usr/bin/env bash
# Deploy backend + /app/ UI to VPS using SSH_HOST + VPS_ROOT_PASSWORD (or SSH_PASSWORD).
set -euo pipefail

RAW_HOST="${SSH_HOST:?SSH_HOST required}"
PASS="${VPS_ROOT_PASSWORD:-${SSH_PASSWORD:-}}"
if [ -z "$PASS" ]; then
  echo "VPS_ROOT_PASSWORD or SSH_PASSWORD required"
  exit 1
fi

# SSH_HOST may include a leading "ssh " prefix and user@host from secrets UI
HOST="$RAW_HOST"
USER="root"
if [[ "$RAW_HOST" =~ ^[Ss][Ss][Hh][[:space:]]+ ]]; then
  RAW_HOST="${RAW_HOST#ssh }"
  RAW_HOST="${RAW_HOST#SSH }"
fi
if [[ "$RAW_HOST" == *"@"* ]]; then
  USER="${RAW_HOST%%@*}"
  HOST="${RAW_HOST#*@}"
fi

export SSHPASS="$PASS"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)

REMOTE_SCRIPT='set -e
APP=/home/umunsi/htdocs/studentapi.umunsi.com
cd "$APP"
git fetch origin main
git checkout main
git reset --hard origin/main
npm ci --omit=dev
# Live API (nginx :3005) runs as umunsi — student-app-api
sudo -u umunsi bash -lc "cd '"$APP"' && pm2 restart student-app-api"
FRONT=/home/umunsi/htdocs/student.umunsi.com
if [ -d "$FRONT" ] && [ -d "$APP/student-web-dist" ]; then
  rsync -a --delete "$APP/student-web-dist/" "$FRONT/"
  echo "Synced student.umunsi.com static files"
fi
sleep 3
curl -fsS https://studentapi.umunsi.com/api/health
echo ""
curl -s -o /dev/null -w "app HTTP %{http_code}\n" https://studentapi.umunsi.com/app/
'

echo "Deploying to ${USER}@${HOST} ..."
sshpass -e ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "bash -s" <<< "$REMOTE_SCRIPT"
