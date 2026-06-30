#!/bin/bash
# Fix route paths in alumni.js
sed -i 's|/admin/alumni/books|/admin/books|g' /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni.js
sed -i 's|/admin/alumni/opportunities|/admin/opportunities|g' /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni.js
sed -i 's|/admin/alumni/past-papers|/admin/past-papers|g' /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni.js

# Fix pool import in alumni-compositions.js
sed -i "s/const { pool } = require/const db = require/" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-compositions.js
sed -i "s/pool\.query/db.query/g" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-compositions.js

# Fix pool import in alumni-social.js
sed -i "s/const { pool } = require/const db = require/" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-social.js
sed -i "s/pool\.query/db.query/g" /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-social.js

# Verify syntax
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni.js
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-compositions.js
node -c /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni-social.js

# Restart
pm2 restart studentapi-main
echo "DONE"
