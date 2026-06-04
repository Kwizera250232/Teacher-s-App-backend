#!/usr/bin/env bash
# Paste into VPS / CloudPanel SSH (root@srv… or Hostinger browser terminal).
# Safe when piped: curl -fsSL .../hostinger-terminal-deploy.sh | bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
if [[ -f "$SCRIPT_DIR/cloudpanel-deploy.sh" ]]; then
  exec bash "$SCRIPT_DIR/cloudpanel-deploy.sh"
fi
# Piped via curl — run cloudpanel deploy from GitHub
exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/Kwizera250232/Teacher-s-App-backend/main/scripts/cloudpanel-deploy.sh)"
