#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM5LCJyb2xlIjoic3R1ZGVudCIsImlhdCI6MTc4MjUxNjY5MiwiZXhwIjoxNzgzMTIxNDkyfQ.HZODhG7dyxtojGsIJamg7Syejn2PRkBqdxrdNHAgVqY"

echo "=== Testing /alumni/join ==="
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" http://localhost:3005/api/alumni/join

echo ""
echo ""
echo "=== Checking user role after join ==="
psql -U postgres -d studentapp_db -c "SELECT id, name, email, role, is_alumni FROM users WHERE id = 139;"
