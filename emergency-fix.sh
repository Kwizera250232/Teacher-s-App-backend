#!/bin/bash
cd /root/Teacher-s-App-frontent/Teacher-s-App-backend

# Fix database name in .env
sed -i 's|/studentapp"|/studentapp_db"|g' .env
sed -i 's|/studentapp$|/studentapp_db|g' .env

# Show what we have
grep DATABASE_URL .env

# Restart with fresh env
pm2 restart studentapi-main --update-env
sleep 3

# Test
curl -s -X POST http://localhost:3005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123456"}'
echo ""
