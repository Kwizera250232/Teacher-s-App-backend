#!/bin/bash
set -e

cd /root/Teacher-s-App-frontent

echo "=== Adding AlumniOnboarding to StudentDashboard.jsx ==="

# 1. Add import
if ! grep -q "import AlumniOnboarding" src/pages/StudentDashboard.jsx; then
  sed -i "/import { classMomentDetailPath }/a import AlumniOnboarding from '../pages/alumni/AlumniOnboarding';" src/pages/StudentDashboard.jsx
fi

# 2. Add state
if ! grep -q "showOnboarding, setShowOnboarding" src/pages/StudentDashboard.jsx; then
  sed -i 's/const \[statusPickerOpen, setStatusPickerOpen\] = useState(false);/const [statusPickerOpen, setStatusPickerOpen] = useState(false);\n  const [showOnboarding, setShowOnboarding] = useState(false);/' src/pages/StudentDashboard.jsx
fi

# 3. Add useEffect check (after the existing useEffect that loads data)
if ! grep -q "alumni_dismissed" src/pages/StudentDashboard.jsx; then
  # Find the useEffect closing and add alumni check before it
  sed -i '/api.get.*class-moments\/preview.*setMomentPreview.*catch/i\\n    if (user?.role === '"'"'student'"'"' \&\& !localStorage.getItem('"'"'alumni_dismissed'"'"')) {\n      setShowOnboarding(true);\n    }' src/pages/StudentDashboard.jsx
fi

# 4. Add JSX rendering (after showParentInvite)
if ! grep -q "<AlumniOnboarding" src/pages/StudentDashboard.jsx; then
  sed -i '/showParentInvite && (/i\      {showOnboarding \&\& (\n        <AlumniOnboarding onClose={() => { setShowOnboarding(false); localStorage.setItem("alumni_dismissed", "1"); }} onComplete={() => setShowOnboarding(false)} />\n      )}\n' src/pages/StudentDashboard.jsx
fi

echo "=== Building frontend ==="
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -5

echo "=== Copying uploads ==="
if [ -d /var/www/Teacher-s-App-backend/uploads ]; then
  mkdir -p public/uploads
  cp -r /var/www/Teacher-s-App-backend/uploads/* public/uploads/ 2>/dev/null || true
fi

echo "=== Pushing to GitHub ==="
git add -A
git commit -m "fix: add AlumniOnboarding to dashboard and rebuild" || true
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_frontent_deploy' git push origin main

echo "=== DONE ==="
echo "Vercel will auto-deploy in ~2 minutes"
