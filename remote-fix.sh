cd /root/Teacher-s-App-frontent/Teacher-s-App-backend/routes
node -e "
const fs = require('fs');
const path = 'alumni.js';
let content = fs.readFileSync(path, 'utf8');
const lastExport = content.lastIndexOf('module.exports = router');
if (lastExport > 0) content = content.substring(0, lastExport).trimEnd();
content += \"\n\nrouter.post('/join', authenticateToken, async (req, res) => {\n  try {\n    await pool.query(\\\"UPDATE users SET is_alumni = TRUE, graduated_at = NOW(), alumni_status = 'active' WHERE id = \\\$1\\\", [req.user.id]);\n    res.json({ success: true, message: 'Welcome to Alumni!' });\n  } catch (err) {\n    console.error('[alumni/join]', err);\n    res.status(500).json({ error: 'Could not join alumni network.' });\n  }\n});\n\nmodule.exports = router;\n\";
fs.writeFileSync(path, content);
console.log('Fixed');
"
pm2 restart studentapi-main
sleep 3
curl -s http://localhost:3005/api/health | head -c 50
echo ""
