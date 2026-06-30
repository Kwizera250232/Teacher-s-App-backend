#!/bin/bash

# Student App Frontend Deployment Script
# This script helps deploy the frontend to Vercel

echo "=== Student App Frontend Deployment ==="
echo ""

# Check if we're in the frontend directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the frontend directory."
    exit 1
fi

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "Error: Git repository not found. Please initialize git first."
    exit 1
fi

echo "1. Checking git status..."
git status

echo ""
echo "2. Adding all changes..."
git add .

echo ""
echo "3. Committing changes..."
read -p "Enter commit message (default: 'fix: update Vercel configuration and authentication'): " commit_msg
commit_msg=${commit_msg:-"fix: update Vercel configuration and authentication"}
git commit -m "$commit_msg"

echo ""
echo "4. Pushing to remote..."
git push origin main

echo ""
echo "=== Deployment Started ==="
echo "Go to your Vercel dashboard to monitor the deployment:"
echo "https://vercel.com/kwizera-jean-de-dieus-projects/frontend"
echo ""
echo "The deployment will start automatically once the push is detected."
echo ""
echo "After deployment, test the following:"
echo "1. https://your-vercel-url.vercel.app/ - Landing page"
echo "2. https://your-vercel-url.vercel.app/api/health - API proxy"
echo "3. https://your-vercel-url.vercel.app/login - Login page"
echo ""
echo "Check DEPLOY-CHECKLIST.md for detailed testing instructions."
