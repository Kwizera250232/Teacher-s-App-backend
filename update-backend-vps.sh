#!/bin/bash

# Backend VPS Update Script
# Run this script on your VPS to update the backend to the latest main branch

echo "=== Student App Backend Update ==="
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the backend directory."
    exit 1
fi

echo "1. Stopping current PM2 process..."
pm2 stop studentapi-main || echo "No existing process to stop"

echo ""
echo "2. Pulling latest changes from main branch..."
git fetch origin
git checkout main
git pull origin main

echo ""
echo "3. Installing dependencies..."
npm install

echo ""
echo "4. Restarting PM2 process..."
pm2 restart studentapi-main || pm2 start index.js --name studentapi-main

echo ""
echo "5. Checking process status..."
pm2 status studentapi-main

echo ""
echo "6. Testing health endpoint..."
sleep 3
curl -s https://studentapi.umunsi.com/api/health

echo ""
echo "=== Update Complete ==="
echo "Backend has been updated to the latest main branch."
echo "Build hash: $(curl -s https://studentapi.umunsi.com/api/health | grep -o '"build":"[^"]*"')"
