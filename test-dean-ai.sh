#!/bin/bash
# End-to-end test of Dean AI
echo "=== Login as alumni ==="
LOGIN=$(curl -s -X POST https://studentapi.umunsi.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kwizera@brightschool.edu","password":"MISSMICHOU783450859@kwizera"}')
echo "$LOGIN" | head -c 200
echo ""
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
echo "Token: ${TOKEN:0:20}..."

if [ -z "$TOKEN" ]; then
  echo "LOGIN FAILED — trying alternate password"
  LOGIN=$(curl -s -X POST https://studentapi.umunsi.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"kwizera@brightschool.edu","password":"kwizera"}')
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
  echo "Token attempt 2: ${TOKEN:0:20}..."
fi

echo ""
echo "=== Test chat endpoint ==="
CHAT=$(curl -s -X POST https://studentapi.umunsi.com/api/dean-ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"What is photosynthesis?","history":[]}')
echo "$CHAT" | head -c 500
echo ""

echo ""
echo "=== Test search-quizzes endpoint ==="
SEARCH=$(curl -s "https://studentapi.umunsi.com/api/dean-ai/search-quizzes?subject=math" \
  -H "Authorization: Bearer $TOKEN")
echo "$SEARCH" | head -c 300
echo ""

echo ""
echo "=== Test generate-quiz endpoint ==="
GEN=$(curl -s -X POST https://studentapi.umunsi.com/api/dean-ai/generate-quiz \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"subject":"Mathematics","grade":"Primary 6","topic":"fractions","count":3}')
echo "$GEN" | head -c 600
echo ""
echo "=== DONE ==="
