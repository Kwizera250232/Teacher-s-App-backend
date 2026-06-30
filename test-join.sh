#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM5LCJyb2xlIjoic3R1ZGVudCIsImlhdCI6MTc4MjUxNjY5MiwiZXhwIjoxNzgzMTIxNDkyfQ.HZODhG7dyxtojGsIJamg7Syejn2PRkBqdxrdNHAgVqY"
echo "Testing /alumni/join..."
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" -X POST http://localhost:3005/api/alumni/join

echo "Testing /alumni/profile/me after join..."
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/profile/me | head -c 200
echo ""
