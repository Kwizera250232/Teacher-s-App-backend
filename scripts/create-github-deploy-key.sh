#!/usr/bin/env bash
# Generate an ed25519 key for GitHub Actions → VPS deploy. Run locally, never commit the private key.
set -euo pipefail
OUT="${1:-./github-deploy-key}"
ssh-keygen -t ed25519 -f "$OUT" -N "" -C "github-actions-uclass-deploy"
chmod 600 "$OUT"
echo ""
echo "Fingerprint (for your records):"
ssh-keygen -lf "${OUT}.pub" -E sha256
echo ""
echo "1) Add GitHub secret SSH_PRIVATE_KEY = contents of: $OUT"
echo "2) Add this public line to VPS /root/.ssh/authorized_keys:"
cat "${OUT}.pub"
echo ""
echo "3) Secrets: SSH_HOST=93.127.186.217  SSH_USER=root"
