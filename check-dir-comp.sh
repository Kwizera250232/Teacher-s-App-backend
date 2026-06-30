#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM5LCJyb2xlIjoic3R1ZGVudCIsImlhdCI6MTc4MjUxNjY5MiwiZXhwIjoxNzgzMTIxNDkyfQ.HZODhG7dyxtojGsIJamg7Syejn2PRkBqdxrdNHAgVqY"

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/directory > /dev/null
grep -B3 'errorMissingColumn' /root/.pm2/logs/studentapi-main-error.log | grep 'column' | tail -1

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/compositions > /dev/null
grep -B3 'errorMissingColumn' /root/.pm2/logs/studentapi-main-error.log | grep 'column' | tail -1
