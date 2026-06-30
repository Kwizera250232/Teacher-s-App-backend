#!/bin/bash
echo "=== Checking alumni-social.js pool import ==="
head -5 /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-social.js

echo ""
echo "=== Checking alumni-compositions.js pool import ==="
head -5 /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-compositions.js

echo ""
echo "=== Last 10 error lines ==="
tail -10 /root/.pm2/logs/studentapi-main-error.log
