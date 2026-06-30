#!/bin/bash
# Test with the token from the last login
# First get a fresh token
BODY='{"email":"kwizera@brightschool.edu","password":"Amahoro123"}'
LOGIN=$(curl -s -X POST http://localhost:3005/api/auth/login -H "Content-Type: application/json" -d "$BODY")
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
ROLE=$(echo "$LOGIN" | grep -o '"role":"[^"]*"' | cut -d'"' -f4)

echo "Role: $ROLE"
echo ""
echo "=== Feed ==="
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/feed | head -c 200
echo ""
echo ""
echo "=== Groups ==="
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/groups | head -c 200
echo ""
echo ""
echo "=== Directory ==="
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/directory | head -c 200
echo ""
