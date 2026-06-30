#!/bin/bash
# Final Alumni Fix - Run everything at once

cd /root/Teacher-s-App-frontent/Teacher-s-App-backend

# Fix 1: Ensure user email is confirmed
su - postgres -c "psql -d studentapp_db -c \"UPDATE users SET email_confirmed = true WHERE email = 'kwizera@brightschool.edu';\""

# Fix 2: Create alumni profile if not exists for user 139
su - postgres -c "psql -d studentapp_db -c \"INSERT INTO alumni_profiles (user_id) SELECT 139 WHERE NOT EXISTS (SELECT 1 FROM alumni_profiles WHERE user_id = 139);\""

# Fix 3: Restart backend with update
pm2 restart studentapi-main --update-env

sleep 2

# Test
echo "Testing login..."
curl -s -X POST http://localhost:3005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kwizera@brightschool.edu","password":"Amahoro123"}' | head -c 100
echo ""

echo "Testing alumni profile..."
TOKEN=$(curl -s -X POST http://localhost:3005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kwizera@brightschool.edu","password":"Amahoro123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3005/api/alumni/profile/me | head -c 100
echo ""

echo "Done!"
