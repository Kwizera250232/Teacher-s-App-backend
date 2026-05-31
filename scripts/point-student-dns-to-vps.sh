#!/usr/bin/env bash
# Point student.umunsi.com at the VPS (93.127.186.217) instead of Vercel.
#
# Option A — Hostinger hPanel (umunsi.com DNS):
#   1. hPanel → Domains → umunsi.com → DNS / DNS Zone
#   2. Remove CNAME record: student → *.vercel-dns-*
#   3. Add A record: student → 93.127.186.217 (TTL 300)
#   4. SSH to VPS: bash scripts/setup-student-domain-vps.sh
#
# Option B — Hostinger API (if you have a token from hpanel.hostinger.com → API):
#   export HOSTINGER_API_TOKEN=your_token
#   bash scripts/point-student-dns-to-vps.sh
#
# Option C — Namecheap API:
#   export NAMECHEAP_API_USER=... NAMECHEAP_API_KEY=... NAMECHEAP_CLIENT_IP=93.127.186.217
#   bash scripts/point-student-dns-to-vps.sh namecheap

set -euo pipefail
VPS_IP="${VPS_IP:-93.127.186.217}"
DOMAIN="${DOMAIN:-umunsi.com}"
SUB="${SUB:-student}"

if [[ "${1:-}" == "namecheap" ]]; then
  : "${NAMECHEAP_API_USER:?Set NAMECHEAP_API_USER}"
  : "${NAMECHEAP_API_KEY:?Set NAMECHEAP_API_KEY}"
  : "${NAMECHEAP_CLIENT_IP:?Set NAMECHEAP_CLIENT_IP (must be whitelisted in Namecheap)}"
  curl -fsS "https://api.namecheap.com/xml.response" \
    --data-urlencode "ApiUser=$NAMECHEAP_API_USER" \
    --data-urlencode "ApiKey=$NAMECHEAP_API_KEY" \
    --data-urlencode "UserName=$NAMECHEAP_API_USER" \
    --data-urlencode "ClientIp=$NAMECHEAP_CLIENT_IP" \
    --data-urlencode "Command=namecheap.domains.dns.setHosts" \
    --data-urlencode "SLD=umunsi" \
    --data-urlencode "TLD=com" \
    --data-urlencode "HostName1=$SUB" \
    --data-urlencode "RecordType1=A" \
    --data-urlencode "Address1=$VPS_IP" \
    --data-urlencode "TTL1=300" | head -20
  echo "Namecheap DNS update requested. Wait a few minutes, then run setup-student-domain-vps.sh on the VPS."
  exit 0
fi

if [[ -n "${HOSTINGER_API_TOKEN:-}" ]]; then
  BODY=$(cat <<EOF
{
  "overwrite": false,
  "zone": [
    {
      "name": "$SUB",
      "type": "A",
      "ttl": 300,
      "records": [{ "content": "$VPS_IP" }]
    }
  ]
}
EOF
)
  curl -fsS -X PUT "https://developers.hostinger.com/api/dns/v1/zones/${DOMAIN}" \
    -H "Authorization: Bearer ${HOSTINGER_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$BODY"
  echo ""
  echo "Hostinger DNS update submitted for ${SUB}.${DOMAIN} → ${VPS_IP}"
  exit 0
fi

echo "No HOSTINGER_API_TOKEN or namecheap args. Update DNS manually (see top of this script)."
exit 1
