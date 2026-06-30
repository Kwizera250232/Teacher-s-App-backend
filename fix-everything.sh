#!/bin/bash
set -e

echo "=== FIXING EVERYTHING ==="

BACKEND=/root/Teacher-s-App-frontent/Teacher-s-App-backend
FRONTEND=/root/Teacher-s-App-frontent

# Fix 1: Copy latest frontend into backend's student-web
echo "Copying latest frontend..."
cp -r $FRONTEND/src $BACKEND/student-web/
cp $FRONTEND/package.json $BACKEND/student-web/
cp $FRONTEND/vite.config.js $BACKEND/student-web/ 2>/dev/null || true
cp $FRONTEND/index.html $BACKEND/student-web/ 2>/dev/null || true

# Fix 2: Add AlumniOnboarding to StudentDashboard if missing
if ! grep -q 'AlumniOnboarding' $BACKEND/student-web/src/pages/StudentDashboard.jsx; then
  echo "Adding AlumniOnboarding import..."
  sed -i "/import { useAuth }/a import AlumniOnboarding from '../pages/alumni/AlumniOnboarding';" $BACKEND/student-web/src/pages/StudentDashboard.jsx
fi

if ! grep -q 'showOnboarding' $BACKEND/student-web/src/pages/StudentDashboard.jsx; then
  echo "Adding showOnboarding state..."
  sed -i 's/const \[showCompositionStatus, setShowCompositionStatus\] = useState(false);/const [showCompositionStatus, setShowCompositionStatus] = useState(false);\n  const [showOnboarding, setShowOnboarding] = useState(false);/' $BACKEND/student-web/src/pages/StudentDashboard.jsx
fi

if ! grep -q 'alumni_dismissed' $BACKEND/student-web/src/pages/StudentDashboard.jsx; then
  echo "Adding alumni_dismissed check..."
  # Find the useEffect and add the alumni check after it
  sed -i '/useEffect(() => {/,/}, \[token\]);/a\\n    if (user?.role === '"'"'student'"'"' \&\& !localStorage.getItem('"'"'alumni_dismissed'"'"')) {\n      setShowOnboarding(true);\n    }' $BACKEND/student-web/src/pages/StudentDashboard.jsx
fi

if ! grep -q '<AlumniOnboarding' $BACKEND/student-web/src/pages/StudentDashboard.jsx; then
  echo "Adding AlumniOnboarding JSX..."
  sed -i 's/{showParentInvite \&\& (/{showOnboarding \&\& (\n        <AlumniOnboarding onClose={() => { setShowOnboarding(false); localStorage.setItem("alumni_dismissed", "1"); }} onComplete={() => setShowOnboarding(false)} />\n      )}\n      {showParentInvite \&\& (/' $BACKEND/student-web/src/pages/StudentDashboard.jsx
fi

# Fix 3: Build frontend
echo "Building frontend..."
cd $BACKEND/student-web
npm install 2>&1 | tail -5
npm run build 2>&1 | tail -5

# Fix 4: Copy dist to student-web-dist
echo "Copying build to student-web-dist..."
rm -rf $BACKEND/student-web-dist/*
cp -r $BACKEND/student-web/dist/* $BACKEND/student-web-dist/

# Fix 5: Fix uploads - copy from old location to new
echo "Fixing uploads..."
if [ -d /var/www/Teacher-s-App-backend/uploads ]; then
  cp -r /var/www/Teacher-s-App-backend/uploads/* $BACKEND/uploads/ 2>/dev/null || true
fi

# Fix 6: Restart backend
echo "Restarting backend..."
pm2 restart studentapi-main --update-env

sleep 2

echo "=== DONE ==="
echo "Testing health..."
curl -s http://localhost:3005/api/health | head -c 50
echo ""
