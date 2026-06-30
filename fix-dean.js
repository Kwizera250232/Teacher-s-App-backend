const fs = require('fs');
const file = '/root/Teacher-s-App-frontent/Teacher-s-App-backend/routes/alumni.js';
let content = fs.readFileSync(file, 'utf8');

// Remove broken route
content = content.replace(/\/\/ Search quizzes by grade\/subject\/year[\s\S]*?res\.status\(500\)\.json\(\{ error: 'Search failed' \}\);\n\}\);/, '');

// Add fixed route before module.exports
const newRoute = `
// Search quizzes by grade/subject/year
router.get('/dean-quizzes/search', authenticateToken, async (req, res) => {
  try {
    const { grade, subject, year } = req.query;
    const searchTerm = grade + ' ' + subject;
    const quizzes = await pool.query(
      "SELECT q.* FROM quizzes q WHERE q.title ILIKE $1 OR q.category ILIKE $1 OR q.title ILIKE $2 ORDER BY q.created_at DESC LIMIT 10",
      ['%' + searchTerm + '%', '%' + subject + '%']
    );
    res.json({ quizzes: quizzes.rows });
  } catch (err) {
    console.error('[dean-quizzes/search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});
`;

content = content.replace('module.exports = router;', newRoute + '\nmodule.exports = router;');
fs.writeFileSync(file, content);
console.log('Fixed dean route!');
