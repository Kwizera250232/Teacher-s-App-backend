#!/usr/bin/env bash
# Debug MTN MoMo production requesttopay - prints raw responses
cd /home/umunsi/htdocs/studentapi.umunsi.com || exit 1
set -a; source .env; set +a

SK=$(printf '%s' "$MTN_SUBSCRIPTION_KEY" | tr -d '\r\n ')
AU=$(printf '%s' "$MTN_API_USER" | tr -d '\r\n ')
AK=$(printf '%s' "$MTN_API_KEY" | tr -d '\r\n ')
BASE="${MTN_BASE_URL:-https://proxy.momoapi.mtn.co.rw}"
ENVV="${MTN_TARGET_ENV:-mtnrwanda}"

echo "== config =="
echo "base=$BASE env=$ENVV keylen=${#SK} userlen=${#AU}"

B64=$(printf '%s' "$AU:$AK" | base64 -w 0)
echo "== token =="
TOKRESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST "$BASE/collection/token/" \
  -H "Authorization: Basic $B64" \
  -H "Ocp-Apim-Subscription-Key: $SK" \
  -H "X-Target-Environment: $ENVV" \
  -H "Content-Length: 0")
echo "$TOKRESP" | tail -3
TOKEN=$(echo "$TOKRESP" | head -n -1 | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token",""))' 2>/dev/null)
echo "token_len=${#TOKEN}"
[ -z "$TOKEN" ] && exit 1

for AMT in 100 500 1000; do
  REF=$(cat /proc/sys/kernel/random/uuid)
  echo "== requesttopay amount=$AMT ref=$REF =="
  curl -s -w '\nHTTP:%{http_code}' -X POST "$BASE/collection/v1_0/requesttopay" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Reference-Id: $REF" \
    -H "X-Target-Environment: $ENVV" \
    -H "Ocp-Apim-Subscription-Key: $SK" \
    -H "Content-Type: application/json" \
    -d "{\"amount\":\"$AMT\",\"currency\":\"RWF\",\"externalId\":\"test12345\",\"payer\":{\"partyIdType\":\"MSISDN\",\"partyId\":\"250783450859\"},\"payerMessage\":\"UClass test\",\"payeeNote\":\"test\"}"
  echo
done
