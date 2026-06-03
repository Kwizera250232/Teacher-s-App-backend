#!/usr/bin/env bash
# Deploy Git (both repos), Vercel (student.umunsi.com), and VPS API (studentapi.umunsi.com).
# Run from backend repo root on a machine with git + npm + optional secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1/4 Build /app/ UI (student-web-dist) ==="
bash "$ROOT/scripts/build-student-web-dist.sh"

echo ""
echo "=== 2/4 Push backend main (API + /app/ static) ==="
git add student-web-dist VERSION 2>/dev/null || true
if git diff --staged --quiet; then
  echo "No student-web-dist changes to commit."
else
  git commit -m "Deploy: rebuild student-web-dist for /app/"
fi
git push origin main

FRONTEND="${FRONTEND_DIR:-$ROOT/../Teacher-s-App-frontent}"
echo ""
echo "=== 3/4 Push frontend main (Vercel Git deploy) ==="
if [[ -d "$FRONTEND/.git" ]]; then
  bash "$ROOT/scripts/sync-student-web-to-frontend.sh" || true
  (cd "$FRONTEND" && git push origin main) || echo "Frontend push skipped (set FRONTEND_DEPLOY_TOKEN if needed)."
else
  echo "Clone Teacher-s-App-frontent next to backend or set FRONTEND_DIR."
fi

echo ""
echo "=== 4/4 VPS API (requires SSH on server) ==="
echo "On Hostinger SSH as root, run:"
echo "  curl -fsSL https://raw.githubusercontent.com/Kwizera250232/Teacher-s-App-backend/main/scripts/vps-emergency-deploy.sh | bash"
echo ""
if [[ -n "${SSH_PRIVATE_KEY:-}" ]]; then
  echo "SSH_PRIVATE_KEY set — running deploy-via-ssh.sh ..."
  bash "$ROOT/scripts/deploy-via-ssh.sh"
  bash "$ROOT/scripts/verify-production-api.sh"
else
  echo "SSH_PRIVATE_KEY not set — skip remote VPS (add GitHub secret or run curl on server)."
fi

echo ""
echo "Done. Verify:"
echo "  curl -s https://studentapi.umunsi.com/api/health"
echo "  curl -s -o /dev/null -w '%{http_code}' https://studentapi.umunsi.com/api/classes/1/guest-marks  # want 401"
echo "  https://student.umunsi.com"
