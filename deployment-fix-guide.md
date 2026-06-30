# Git Branch Fix and Deployment Guide

## Issue Identified
The error "src refspec main does not match any" indicates that the repository doesn't have a "main" branch. Many repositories use "master" as the default branch instead.

## Solution

### Step 1: Check Existing Branches
On your VPS, run:

```bash
# Navigate to the backend repository
cd /path/to/Teacher-s-App-backend

# Check available branches
git branch -a

# Check current branch
git branch --show-current
```

### Step 2: Determine Primary Branch
The repository likely uses "master" instead of "main". Check which one exists:

```bash
# Check if master exists
git show-ref --verify --quiet refs/heads/master && echo "master exists" || echo "master does not exist"

# Check if main exists  
git show-ref --verify --quiet refs/heads/main && echo "main exists" || echo "main does not exist"
```

### Step 3: Update with Correct Branch
If the repository uses "master":

```bash
# Fetch latest changes
git fetch origin

# Checkout master branch
git checkout master

# Pull latest changes
git pull origin master

# Install dependencies
npm install

# Restart PM2
pm2 restart studentapi-main
```

If the repository uses "main":

```bash
# Fetch latest changes
git fetch origin

# Checkout main branch
git checkout main

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Restart PM2
pm2 restart studentapi-main
```

### Step 4: Update Deployment Scripts
Update any deployment scripts to use the correct branch name:

**In cloudpanel-deploy.sh or similar scripts:**
```bash
# Change from:
git checkout main
git pull origin main

# To (if using master):
git checkout master
git pull origin master
```

## Frontend Deployment

### Check Frontend Repository Branch
The same issue might affect the frontend repository:

```bash
cd /path/to/Teacher-s-App-frontent
git branch -a
git branch --show-current
```

### Deploy Frontend Changes
Once you know the correct branch:

```bash
# Navigate to frontend
cd /path/to/Teacher-s-App-frontent

# Checkout correct branch (master or main)
git checkout master  # or git checkout main

# Pull latest changes
git pull origin master  # or git pull origin main

# Deploy to Vercel (if using their script)
./deploy-vercel-frontent.sh

# Or manually push changes
git add .
git commit -m "fix: update Vercel configuration"
git push origin master  # or git push origin main
```

## Quick Fix Commands

### For Backend (if using master):
```bash
cd /path/to/Teacher-s-App-backend
git fetch origin
git checkout master
git pull origin master
npm install
pm2 restart studentapi-main
curl https://studentapi.umunsi.com/api/health
```

### For Frontend (if using master):
```bash
cd /path/to/Teacher-s-App-frontent
git fetch origin
git checkout master
git pull origin master
./deploy-vercel-frontent.sh
```

## Verification

After fixing the branch issue:

### Backend:
```bash
# Check PM2 status
pm2 status

# Check health endpoint
curl https://studentapi.umunsi.com/api/health

# Should return latest build hash
```

### Frontend:
1. Visit your Vercel URL
2. Check for deployment success in Vercel dashboard
3. Test login functionality
4. Verify no 404 errors

## Common Git Branch Issues

### Repository has no branches
If the repository has no branches at all:

```bash
# Check if there are any commits
git log

# If there are commits, create a branch
git checkout -b master

# If no commits, you may need to reclone
cd ..
rm -rf Teacher-s-App-backend
git clone https://github.com/Kwizera250232/Teacher-s-App-backend.git
cd Teacher-s-App-backend
```

### Repository is detached
If you're in a detached HEAD state:

```bash
# Check current state
git status

# Attach to a branch
git checkout master  # or main
```

## Automation Fix

Update the deployment script to handle both branch names:

```bash
#!/bin/bash

# Determine the primary branch
if git show-ref --verify --quiet refs/heads/main; then
    BRANCH="main"
elif git show-ref --verify --quiet refs/heads/master; then
    BRANCH="master"
else
    echo "Error: No main or master branch found"
    exit 1
fi

echo "Using branch: $BRANCH"

# Pull latest changes
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

# Rest of deployment script...
```

## Current Status

Based on your git output:
- ✅ Files are being tracked and modified
- ❌ Branch "main" doesn't exist (likely using "master")
- ❌ Push failed due to branch mismatch

## Next Steps

1. **Check which branch your repositories use** (master vs main)
2. **Update the deployment scripts** to use the correct branch
3. **Run the updated deployment** for both backend and frontend
4. **Verify both services** are working correctly

## Support

If you're still having issues:
1. Run `git branch -a` to see all available branches
2. Check the GitHub repository to see the default branch name
3. The GitHub repository URL will show the default branch
4. Update all scripts to use the correct branch name consistently
