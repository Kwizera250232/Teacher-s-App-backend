#!/bin/bash

# Smart Backend Deployment Script
# Automatically detects and uses the correct branch (main or master)

echo "=== Smart Backend Deployment ==="
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "Error: Not a git repository. Please run from the backend directory."
    exit 1
fi

# Determine the primary branch
if git show-ref --verify --quiet refs/heads/main; then
    BRANCH="main"
elif git show-ref --verify --quiet refs/heads/master; then
    BRANCH="master"
else
    echo "Error: No main or master branch found."
    echo "Available branches:"
    git branch -a
    exit 1
fi

echo "Detected primary branch: $BRANCH"
echo ""

# Stop current process
echo "1. Stopping current PM2 process..."
pm2 stop studentapi-main 2>/dev/null || echo "No existing process to stop"

# Fetch latest changes
echo "2. Fetching latest changes..."
git fetch origin

# Checkout the correct branch
echo "3. Checking out $BRANCH branch..."
git checkout $BRANCH

# Pull latest changes
echo "4. Pulling latest changes from origin/$BRANCH..."
git pull origin $BRANCH

# Install dependencies
echo "5. Installing dependencies..."
npm install

# Restart process
echo "6. Restarting PM2 process..."
pm2 restart studentapi-main || pm2 start index.js --name studentapi-main

# Wait for startup
echo "7. Waiting for server to start..."
sleep 5

# Check status
echo "8. Checking process status..."
pm2 status studentapi-main

# Test health endpoint
echo "9. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s https://studentapi.umunsi.com/api/health)
echo "$HEALTH_RESPONSE"

# Extract build hash
BUILD_HASH=$(echo "$HEALTH_RESPONSE" | grep -o '"build":"[^"]*"' | cut -d'"' -f4)

echo ""
echo "=== Deployment Complete ==="
echo "Branch: $BRANCH"
echo "Build Hash: $BUILD_HASH"
echo "Status: $(pm2 status studentapi-main | grep studentapi-main | awk '{print $10}')"
