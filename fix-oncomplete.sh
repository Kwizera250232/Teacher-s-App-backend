#!/bin/bash
FILE=/root/Teacher-s-App-frontent/src/pages/StudentDashboard.jsx

# Fix onComplete to also set alumni_dismissed
sed -i 's/onComplete={() => setShowOnboarding(false)}/onComplete={() => { setShowOnboarding(false); localStorage.setItem("alumni_dismissed", "1"); }}/' "$FILE"

grep 'onComplete' "$FILE"
