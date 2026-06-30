#!/bin/bash
FILE=/root/Teacher-s-App-frontent/src/pages/StudentDashboard.jsx

# Change the alumni check to also use is_alumni flag
sed -i "s/if (user?.role === 'student' && !localStorage.getItem('alumni_dismissed')) {/if (user?.role === 'student' \&\& !user?.is_alumni \&\& !localStorage.getItem('alumni_dismissed')) {/" "$FILE"

grep "alumni_dismissed" "$FILE"
