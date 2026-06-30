# Student App Deployment Checklist

## ✅ Backend Status (VPS)
- **Status**: Online and healthy
- **Build**: `73af44b4e8701b693abfa7ef58b828aac1a699bf`
- **PM2 Process**: `studentapi-main` running
- **Health Check**: All features enabled
- **Authentication**: Working correctly (401 responses for unauthorized requests)

## 🔄 Frontend Deployment Steps

### 1. Commit and Push Changes
```bash
# In the frontend repository (Teacher-s-App-frontent)
git add .
git commit -m "fix: update Vercel configuration for API proxying and authentication"
git push origin main
```

### 2. Verify Vercel Environment Variables
Go to your Vercel project settings and ensure:
- No additional environment variables needed (app uses production defaults)
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

### 3. Monitor Vercel Deployment
- Watch the deployment logs in Vercel dashboard
- Ensure build completes successfully
- Check for any build errors

### 4. Test the Deployment
Once deployed, test these URLs:
- `https://your-vercel-url.vercel.app/` - Should show landing page
- `https://your-vercel-url.vercel.app/api/health` - Should proxy to backend
- `https://your-vercel-url.vercel.app/login` - Should show login form

## 🔍 Post-Deployment Testing

### 1. API Connectivity Test
```bash
# Test API proxy through Vercel
curl https://your-vercel-url.vercel.app/api/health

# Should return same as direct backend call:
# {"status":"ok","build":"73af44b4e8701b693abfa7ef58b828aac1a699bf",...}
```

### 2. Authentication Flow Test
1. Navigate to `/login`
2. Enter test credentials
3. Click login
4. Verify redirect to dashboard (not blank page)
5. Check browser console for errors

### 3. Browser Console Checks
Open browser DevTools (F12) and check:
- **Console tab**: No JavaScript errors
- **Network tab**: API requests returning 200/201/401 (not 404/500)
- **Application tab**: localStorage contains token and user data

## 🚨 Common Issues and Solutions

### Issue: API Returns 404
**Cause**: Vercel rewrites not working
**Solution**: 
- Check `vercel.json` configuration
- Verify build deployed the new config
- Check Vercel deployment logs

### Issue: CORS Errors
**Cause**: Backend not allowing Vercel domain
**Solution**:
- Check backend `index.js` CORS configuration
- Add Vercel domain to CORS origins
- Restart backend on VPS

### Issue: Blank Page After Login
**Cause**: Navigation or loading state issue
**Solution**:
- Check browser console for errors
- Verify `HomeRedirect` component has loading state
- Check that navigation includes `{ replace: true }`

### Issue: Build Failures
**Cause**: Missing dependencies or build errors
**Solution**:
- Check `frontend/package.json` has all dependencies
- Run `npm install` locally to test
- Check Vercel build logs for specific errors

## 📊 Monitoring

### Backend Health
```bash
# On VPS
pm2 status
pm2 logs studentapi-main
curl https://studentapi.umunsi.com/api/health
```

### Frontend Health
- Check Vercel dashboard for deployment status
- Monitor Vercel analytics for errors
- Check browser console for client-side errors

## 🔄 Rollback Plan

If Frontend Issues Arise:
1. Go to Vercel dashboard
2. Navigate to Deployments
3. Find previous working deployment
4. Click "Promote to Production" or "Redeploy"

If Backend Issues Arise:
```bash
# On VPS
cd /path/to/backend
git checkout previous-commit-hash
npm install
pm2 restart studentapi-main
```

## ✅ Success Criteria

- [ ] Frontend deploys successfully to Vercel
- [ ] API health check returns correct response through Vercel proxy
- [ ] Login page loads without errors
- [ ] Authentication redirects to correct dashboard
- [ ] No blank pages after login
- [ ] All API requests return proper responses
- [ ] Browser console shows no errors

## 📞 Support

If issues persist:
1. Check Vercel deployment logs
2. Check backend PM2 logs: `pm2 logs studentapi-main`
3. Verify backend health: `curl https://studentapi.umunsi.com/api/health`
4. Check browser console and network tab
5. Review this checklist and documentation

## 🎯 Current Status

- ✅ Backend: Deployed and healthy
- ⏳ Frontend: Ready for deployment with updated configuration
- ⏳ Testing: Pending deployment completion

**Next Action**: Deploy frontend changes to Vercel and test authentication flow.
