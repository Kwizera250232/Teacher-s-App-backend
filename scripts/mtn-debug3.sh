#!/usr/bin/env bash
cd /home/umunsi/htdocs/studentapi.umunsi.com || exit 1
set -a; source .env; set +a
SK=$(printf '%s' "$MTN_SUBSCRIPTION_KEY" | tr -d '\r\n ')
AU=$(printf '%s' "$MTN_API_USER" | tr -d '\r\n ')
AK=$(printf '%s' "$MTN_API_KEY" | tr -d '\r\n ')
BASE="${MTN_BASE_URL:-https://proxy.momoapi.mtn.co.rw}"
B64=$(printf '%s' "$AU:$AK" | base64 -w 0)
TOKEN=$(curl -s -X POST "$BASE/collection/token/" -H "Authorization: Basic $B64" -H "Ocp-Apim-Subscription-Key: $SK" -H "X-Target-Environment: mtnrwanda" -H "Content-Length: 0" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "token_len=${#TOKEN}"

try() {
  local label="$1"; local body="$2"; shift 2
  local REF=$(cat /proc/sys/kernel/random/uuid)
  local code=$(curl -s -o /tmp/mtnresp.txt -w '%{http_code}' -X POST "$BASE/collection/v1_0/requesttopay" \
    -H "Authorization: Bearer $TOKEN" -H "X-Reference-Id: $REF" -H "X-Target-Environment: mtnrwanda" \
    -H "Ocp-Apim-Subscription-Key: $SK" -H "Content-Type: application/json" "$@" -d "$body")
  echo "$label -> $code  body:$(head -c 150 /tmp/mtnresp.txt | tr '\n' ' ')"
}

ASCII='{"amount":"100","currency":"RWF","externalId":"test12345","payer":{"partyIdType":"MSISDN","partyId":"250783450859"},"payerMessage":"UClass test","payeeNote":"test"}'
EMDASH='{"amount":"100","currency":"RWF","externalId":"test12345","payer":{"partyIdType":"MSISDN","partyId":"250783450859"},"payerMessage":"UClass — Test (30 days)","payeeNote":"UClass class subscription"}'

try "ascii msg"            "$ASCII"
try "em-dash msg"          "$EMDASH"
try "em-dash + keepalive"  "$EMDASH" -H 'connection: keep-alive'
