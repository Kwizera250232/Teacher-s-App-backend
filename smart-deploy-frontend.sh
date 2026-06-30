#!/bin/bash

# Smart Frontend Deployment Script
# Automatically detects and uses the correct branch (main or master)

echo "=== Smart Frontend Deployment ==="
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "Error: Not a git repository. Please run from the frontend directory."
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

# Stage all changes
echo "1. Staging changes..."
git add .

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "No changes to commit. Proceeding to push..."
else
    # Commit changes
    echo "2. Committing changes..."
    read -p "Enter commit message (default: 'fix: update Vercel configuration and authentication'): " commit_msg
    commit_msg=${commit_msg:-"fix: update Vercel configuration and authentication"}
    git commit -m "$commit_msg"
fi

# Push to remote
echo "3. Pushing to origin/$BRANCH..."
git push origin $BRANCH

echo ""
echo "=== Deployment Initiated ==="
echo "Branch: $BRANCH"
echo "Go to Vercel dashboard to monitor deployment:"
echo "https://vercel.com/kwizera-jean-de-dieus-projects/frontend"
echo ""
echo "After deployment, test:"
echo "1. https://your-vercel-url.vercel.app/ - Landing page"
echo "2. https://your-vercel-url.vercel.app/api/health - API proxy"
echo "3. https://your-vercel-url.vercel.app/login - Login page"
