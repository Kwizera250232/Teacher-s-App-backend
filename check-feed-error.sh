#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM5LCJyb2xlIjoic3R1ZGVudCIsImlhdCI6MTc4MjUxNjY5MiwiZXhwIjoxNzgzMTIxNDkyfQ.HZODhG7dyxtojGsIJamg7Syejn2PRkBqdxrdNHAgVqY"

echo "=== Feed error ==="
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/feed > /dev/null
tail -3 /root/.pm2/logs/studentapi-main-error.log

echo ""
echo "=== Directory error ==="
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/directory > /dev/null
tail -3 /root/.pm2/logs/studentapi-main-error.log

echo ""
echo "=== Compositions error ==="
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/compositions > /dev/null
tail -3 /root/.pm2/logs/studentapi-main-error.log
