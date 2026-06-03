#!/usr/bin/env bash
# Run from Cursor Cloud Agent when SSH_PRIVATE_KEY (+ SSH_USER) are set as secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash "$ROOT/scripts/deploy-via-ssh.sh"
sleep 6
bash "$ROOT/scripts/verify-production-api.sh"
echo "Production deploy complete."
