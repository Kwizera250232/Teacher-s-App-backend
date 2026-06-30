#!/bin/bash
# Mount dean-ai routes
grep -q "dean-ai" /root/Teacher-s-App-frontent/Teacher-s-App-backend/index.js || \
  sed -i "/app.use('\/api\/alumni'/a app.use('/api/dean-ai', require('./routes/dean-ai'));" /root/Teacher-s-App-frontent/Teacher-s-App-backend/index.js

# Fix duplicate GEMINI_API_KEY in .env (keep only one)
sed -i '/^GEMINI_API_KEY=AQ/!{/^GEMINI_API_KEY=/d}' /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env
# Ensure we have exactly one with the key
grep -q 'GEMINI_API_KEY=AQ' /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env || \
  echo 'GEMINI_API_KEY=your-gemini-api-key-here' >> /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env

# Verify
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/dean-ai.js
grep dean-ai /root/Teacher-s-App-frontent/Teacher-s-App-backend/index.js
grep GEMINI /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env

# Restart
pm2 restart studentapi-main
echo "DONE"
