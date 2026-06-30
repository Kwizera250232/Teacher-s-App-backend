#!/bin/bash
curl -s -X POST http://localhost:3005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123456"}' \
  > /tmp/login-response.json
cat /tmp/login-response.json
echo ""
