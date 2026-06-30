#!/bin/bash
# Allow alumni to access class content and submit quizzes/homework

# 1. quizzes.js - allow alumni to submit quizzes
sed -i "s/requireRole('student', 'guest')/requireRole('student', 'guest', 'alumni')/g" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/quizzes.js

# 2. homework.js - allow alumni to submit homework and view submissions
sed -i "s/requireRole('student')/requireRole('student', 'alumni')/g" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/homework.js

# 3. class_group_quizzes.js - allow alumni
sed -i "s/requireRole('student')/requireRole('student', 'alumni')/g" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/class_group_quizzes.js

# 4. composition_status.js - allow alumni
sed -i "s/requireRole('student')/requireRole('student', 'alumni')/g" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/composition_status.js

# 5. classes.js - allow alumni to view their class
sed -i "s/requireRole('student')/requireRole('student', 'alumni')/g" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/classes.js

# 6. Add alumni-specific endpoints in alumni.js for fetching class content by class_id
# These endpoints will fetch notes, homework, quizzes for the alumni's saved class_id

# Verify syntax
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/quizzes.js
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/homework.js
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/class_group_quizzes.js
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/composition_status.js
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/classes.js

# Restart
pm2 restart studentapi-main
echo "DONE - Alumni can now access all class content"
