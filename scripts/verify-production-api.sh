#!/usr/bin/env bash
# Exit 0 only if studentapi.umunsi.com serves current API routes (not an old orphan).
set -euo pipefail
BASE="${API_BASE:-https://studentapi.umunsi.com}"
HEALTH="$(curl -fsS "${BASE}/api/health")"
echo "$HEALTH"
BUILD="$(echo "$HEALTH" | sed -n 's/.*"build":"\([^"]*\)".*/\1/p')"
if [[ -z "$BUILD" ]]; then
  echo "ERROR: health has no build id" >&2
  exit 1
fi
if [[ "$BUILD" == "575e5671f949be836b9dcba325fdb38174bfe59e" ]]; then
  echo "ERROR: API still on pre-June 2026 build. Run scripts/restart-production-api.sh on the VPS (not only pm2 restart studentapi)." >&2
  exit 1
fi

check_route() {
  local name="$1"
  local method="$2"
  local path="$3"
  local want="$4"
  local extra="${5:-}"
  local code
  if [[ "$method" == GET ]]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")"
  else
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}${path}" -H 'Content-Type: application/json' ${extra})"
  fi
  echo "${name} → HTTP ${code} (want ${want}, not 404)"
  if [[ "$code" == "404" ]]; then
    echo "ERROR: ${name} missing on live API — deploy did not switch traffic to new code." >&2
    exit 1
  fi
  if [[ "$code" != "$want" ]]; then
    echo "WARNING: ${name} returned ${code}, expected ${want}" >&2
  fi
}

check_route "guest-marks" GET "/api/classes/1/guest-marks" "401"
check_route "inyandiko-dashboard" GET "/api/classes/inyandiko/dashboard" "401"
check_route "parent accept-invite" POST "/api/parent/accept-invite" "401" "-d '{}'"
check_route "class-moments react" POST "/api/class-moments/1/react" "401" "-d '{\"emoji\":\"like\"}'"
echo "OK: production API looks up to date (build ${BUILD:0:12}…)."
