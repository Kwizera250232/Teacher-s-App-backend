const fs = require('fs');
const file = 'c:/STUDENT APP/alumni.js.bak';
let content = fs.readFileSync(file, 'utf8');

// Fix 1: Add missing closing for router.delete
content = content.replace(
  /res\.status\(500\)\.json\(\{ error: 'Failed to delete past paper' \}\);\n  \}\n\n\/\/ Top writers/,
  "res.status(500).json({ error: 'Failed to delete past paper' });\n  }\n});\n\n// Top writers"
);

// Fix 2: Fix unquoted SQL in top-writers
content = content.replace(
  /const writers = await pool\.query\(\n      SELECT u\.id, u\.name, u\.school_id, s\.name as school, COUNT\(DISTINCT a\.id\) as articles\n       FROM users u\n       LEFT JOIN alumni_feed_posts a ON a\.user_id = u\.id\n       LEFT JOIN schools s ON u\.school_id = s\.id\n       WHERE u\.role = 'alumni' OR u\.is_alumni = TRUE\n       GROUP BY u\.id, s\.name\n       ORDER BY articles DESC\n       LIMIT 5\n    \);/,
  "const writers = await pool.query(\n      'SELECT u.id, u.name, u.school_id, s.name as school, COUNT(DISTINCT a.id) as articles FROM users u LEFT JOIN alumni_feed_posts a ON a.user_id = u.id LEFT JOIN schools s ON u.school_id = s.id WHERE u.role = \\'alumni\\' OR u.is_alumni = TRUE GROUP BY u.id, s.name ORDER BY articles DESC LIMIT 5'\n    );"
);

// Fix 3: Fix truncated SQL in feed/:id - post query
content = content.replace(
  "'SELECT f.*, u.name as author_name FROM alumni_feed_posts f LEFT JOIN users u ON f.user_id = u.id WHERE f.id = ',",
  "'SELECT f.*, u.name as author_name FROM alumni_feed_posts f LEFT JOIN users u ON f.user_id = u.id WHERE f.id = $1',"
);

// Fix 4: Fix truncated SQL in feed/:id - comments query
content = content.replace(
  "'SELECT c.*, u.name as author_name FROM alumni_feed_comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.post_id =  ORDER BY c.created_at DESC',",
  "'SELECT c.*, u.name as author_name FROM alumni_feed_comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.post_id = $1 ORDER BY c.created_at DESC',"
);

fs.writeFileSync('c:/STUDENT APP/alumni-fixed.js', content);
console.log('Fixed file written to alumni-fixed.js');
