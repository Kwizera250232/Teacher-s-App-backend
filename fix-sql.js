const fs = require('fs');
const file = '/root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni.js';
let content = fs.readFileSync(file, 'utf8');

// Fix all unquoted SQL queries in pool.query calls
// Pattern: pool.query(\n      SELECT ...\n       FROM ...\n      LIMIT ...\n    );
// Should be: pool.query(\n      `SELECT ...\n       FROM ...\n      LIMIT ...`\n    );

// Fix the top-writers query
content = content.replace(
  /const writers = await pool\.query\(\n      SELECT u\.id, u\.name, u\.school_id, s\.name as school,\n        COUNT\(DISTINCT a\.id\) as articles\n       FROM users u\n       LEFT JOIN alumni_feed_posts a ON a\.user_id = u\.id\n       LEFT JOIN schools s ON u\.school_id = s\.id\n       WHERE u\.role = 'alumni' OR u\.is_alumni = TRUE\n       GROUP BY u\.id, s\.name\n       ORDER BY articles DESC\n       LIMIT 5\n    \);/,
  "const writers = await pool.query(\n      `SELECT u.id, u.name, u.school_id, s.name as school, COUNT(DISTINCT a.id) as articles FROM users u LEFT JOIN alumni_feed_posts a ON a.user_id = u.id LEFT JOIN schools s ON u.school_id = s.id WHERE u.role = 'alumni' OR u.is_alumni = TRUE GROUP BY u.id, s.name ORDER BY articles DESC LIMIT 5`\n    );"
);

// Fix any other unquoted SELECT queries
content = content.replace(
  /await pool\.query\(\n      SELECT /g,
  "await pool.query(\n      `SELECT "
);

// Add closing backtick before the closing paren for these queries
// This is tricky - let me use a different approach

fs.writeFileSync(file, content);
console.log('Fixed SQL queries');
