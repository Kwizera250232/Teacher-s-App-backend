#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM5LCJyb2xlIjoic3R1ZGVudCIsImlhdCI6MTc4MjUxNjY5MiwiZXhwIjoxNzgzMTIxNDkyfQ.HZODhG7dyxtojGsIJamg7Syejn2PRkBqdxrdNHAgVqY"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/directory > /dev/null
grep 'column.*does not exist' /root/.pm2/logs/studentapi-main-error.log | tail -1
