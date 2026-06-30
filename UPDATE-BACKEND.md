# Backend VPS Update Instructions

## Issue
The frontend is receiving 404 errors with the message: "This feature is not on the server yet (404). Update studentapi.umunsi.com from the latest main branch."

This means the backend API on the VPS is running an older version that doesn't have all the endpoints the frontend expects.

## Solution

### Option 1: Quick One-Liner (Recommended)
Run this command on your VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/Kwizera250232/Teacher-s-App-backend/main/scripts/cloudpanel-deploy.sh | bash
```

### Option 2: Manual Update
If you prefer to update manually, run these commands on your VPS:

```bash
# Navigate to your backend directory
cd /path/to/Teacher-s-App-backend

# Stop the current process
pm2 stop studentapi-main

# Pull latest changes
git fetch origin
git checkout main
git pull origin main

# Install dependencies
npm install

# Restart the process
pm2 restart studentapi-main

# Check status
pm2 status studentapi-main

# Test health endpoint
curl -s https://studentapi.umunsi.com/api/health
```

### Option 3: Using the Update Script
1. Copy the `update-backend-vps.sh` script to your VPS
2. Make it executable: `chmod +x update-backend-vps.sh`
3. Run it: `./update-backend-vps.sh`

## Verification

After updating, verify the backend is working correctly:

```bash
# Check health endpoint
curl https://studentapi.umunsi.com/api/health

# Should return something like:
# {"status":"ok","build":"latest_commit_hash","features":{...}}

# Check specific endpoints that were returning 404
curl https://studentapi.umunsi.com/api/classes/1/classroom
# Should return 401 (unauthorized) instead of 404

curl https://studentapi.umunsi.com/api/parent/hub
# Should return 401 (unauthorized) instead of 404
```

## Troubleshooting

### If Git Pull Fails
```bash
# Check git status
git status

# If there are uncommitted changes, stash them
git stash

# Then pull again
git pull origin main
```

### If NPM Install Fails
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

### If PM2 Restart Fails
```bash
# Check PM2 logs
pm2 logs studentapi-main

# Try starting fresh
pm2 delete studentapi-main
pm2 start index.js --name studentapi-main
```

### If Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>

# Restart PM2
pm2 restart studentapi-main
```

## Post-Update Testing

Once the backend is updated, test the frontend:

1. **Clear browser cache** (important!)
2. **Visit your Vercel URL**
3. **Try logging in**
4. **Check browser console** (F12) for any remaining errors
5. **Test key features**:
   - Login/Logout
   - Dashboard loading
   - Class access
   - Profile page

## Expected Results

After the update:
- ✅ All API endpoints should return proper responses (401 for unauthorized, not 404)
- ✅ Health check should show latest build hash
- ✅ Frontend should work without "feature not on server" errors
- ✅ Authentication should work correctly

## Current vs Expected Build Hash

**Current Build**: `73af44b4e8701b693abfa7ef58b828aac1a699bf` (from your PM2 status)

**Expected**: Latest build hash from main branch (will be different after update)

## Monitoring

After updating, monitor the backend:

```bash
# Check PM2 status
pm2 status

# View real-time logs
pm2 logs studentapi-main

# Monitor resource usage
pm2 monit
```

## Rollback Plan

If something goes wrong after the update:

```bash
# Check previous commits
git log --oneline -10

# Checkout previous working version
git checkout <previous-commit-hash>

# Restart with previous version
pm2 restart studentapi-main
```

## Automation

To prevent this issue in the future, consider setting up:
1. **GitHub Actions** to auto-deploy on push to main
2. **Webhooks** to trigger VPS updates
3. **Scheduled checks** to ensure backend is up-to-date

## Support

If issues persist after updating:
1. Check backend logs: `pm2 logs studentapi-main`
2. Verify database connection
3. Check environment variables in `.env`
4. Review error messages in browser console
5. Test API endpoints directly with curl
