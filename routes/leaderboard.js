const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function countWords(text = '') {
  const matches = String(text).match(/[A-Za-z']+/g);
  return matches ? matches.length : 0;
}

function words(text = '') {
  return String(text)
    .toLowerCase()
    .match(/[a-z']+/g) || [];
}

function uniqueWords(text = '') {
  return new Set(words(text));
}

function extractCompositionParts(content = '') {
  const raw = String(content || '');
  const lines = raw.split('\n');
  const firstLine = (lines[0] || '').trim();
  const title = firstLine.startsWith('📌 ') ? firstLine.slice(3).trim() : firstLine;

  let introduction = '';
  let body = '';
  let conclusion = '';

  const introMatch = raw.match(/📖 Introduction\s*([\s\S]*?)(?:\n\s*📝 Body|$)/i);
  const bodyMatch = raw.match(/📝 Body\s*([\s\S]*?)(?:\n\s*🏁 Conclusion|$)/i);
  const conclusionMatch = raw.match(/🏁 Conclusion\s*([\s\S]*)$/i);

  if (introMatch) introduction = introMatch[1].trim();
  if (bodyMatch) body = bodyMatch[1].trim();
  if (conclusionMatch) conclusion = conclusionMatch[1].trim();

  const fullText = [title, introduction, body, conclusion].filter(Boolean).join(' ');
  return { title, introduction, body, conclusion, fullText };
}

function scoreComposition(content = '') {
  const { title, introduction, body, conclusion, fullText } = extractCompositionParts(content);
  const fullTextWords = countWords(fullText);

  // 1) 5Ws in introduction (20)
  const introLower = introduction.toLowerCase();
  const ws = ['who', 'what', 'when', 'where', 'why'];
  const foundWs = ws.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(introLower)).length;
  const fiveWsScore = Math.round((foundWs / 5) * 20);

  // 2) Good matching title (15)
  const titleSet = uniqueWords(title).size ? uniqueWords(title) : new Set();
  const bodySet = uniqueWords(`${introduction} ${body}`);
  let titleOverlap = 0;
  for (const t of titleSet) {
    if (bodySet.has(t)) titleOverlap += 1;
  }
  const titleMatchRatio = titleSet.size ? titleOverlap / titleSet.size : 0;
  const titleScore = Math.round(Math.min(1, titleMatchRatio) * 15);

  // 3) At least 5 paragraphs (20)
  const bodyParagraphs = body
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const paragraphCount = bodyParagraphs.length;
  const paragraphScore = Math.round(Math.min(1, paragraphCount / 5) * 20);

  // 4) Good background + conclusion (20)
  const bgKeywords = ['background', 'history', 'context', 'situation', 'overview'];
  const hasBackground = bgKeywords.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(`${introduction} ${body}`));
  const conclusionWords = countWords(conclusion);
  const conclusionMarkers = ['in conclusion', 'to conclude', 'therefore', 'overall', 'in summary'];
  const hasConclusionMarker = conclusionMarkers.some((k) => conclusion.toLowerCase().includes(k));
  const backgroundConclusionScore = Math.min(
    20,
    (hasBackground ? 8 : 0) +
      (conclusionWords >= 50 ? 8 : Math.round((conclusionWords / 50) * 8)) +
      (hasConclusionMarker ? 4 : 0)
  );

  // 5) Grammar heuristic (25)
  const textForGrammar = `${introduction} ${body} ${conclusion}`.trim();
  const sentences = textForGrammar.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const sentenceCount = sentences.length;
  const capitalizedStarts = sentences.filter((s) => /^[A-Z]/.test(s)).length;
  const capitalizationRatio = sentenceCount ? capitalizedStarts / sentenceCount : 0;
  const punctCount = (textForGrammar.match(/[.!?]/g) || []).length;
  const punctRatio = sentenceCount ? Math.min(1, punctCount / sentenceCount) : 0;
  const alphaChars = (textForGrammar.match(/[A-Za-z]/g) || []).length;
  const totalChars = textForGrammar.length || 1;
  const alphaRatio = alphaChars / totalChars;
  const grammarScore = Math.round(
    Math.min(1, (capitalizationRatio * 0.45) + (punctRatio * 0.35) + (alphaRatio * 0.20)) * 25
  );

  const totalScore = Math.max(
    0,
    Math.min(100, fiveWsScore + titleScore + paragraphScore + backgroundConclusionScore + grammarScore)
  );

  return {
    score: totalScore,
    word_count: fullTextWords,
    paragraph_count: paragraphCount,
    criteria: {
      five_ws_in_intro: fiveWsScore,
      title_match: titleScore,
      paragraphs: paragraphScore,
      background_conclusion: backgroundConclusionScore,
      grammar: grammarScore,
    },
    parsed: { title, introduction, body, conclusion },
  };
}

// Ensure badges table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS student_badges (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge VARCHAR(50) NOT NULL,
    quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    awarded_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, badge, quiz_id)
  )
`).catch(console.error);

// GET leaderboard for a class (best score per student per quiz, then summed)
router.get('/:classId/leaderboard', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH best_attempts AS (
         SELECT DISTINCT ON (quiz_id, student_id)
           quiz_id, student_id, score, total
         FROM quiz_attempts
         WHERE quiz_id IN (SELECT id FROM quizzes WHERE class_id = $1)
         ORDER BY quiz_id, student_id, score DESC, attempted_at ASC
       )
       SELECT
         u.id AS student_id,
         u.name AS student_name,
         COUNT(DISTINCT ba.quiz_id)::int AS quizzes_taken,
         COALESCE(SUM(ba.score)::int, 0) AS total_score,
         COALESCE(SUM(ba.total)::int, 0) AS total_possible,
         ROUND(SUM(ba.score)::numeric / NULLIF(SUM(ba.total),0) * 100) AS avg_percentage,
         MAX(ba.score::numeric / NULLIF(ba.total,0) * 100) AS best_percentage
       FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       LEFT JOIN best_attempts ba ON ba.student_id = u.id
       WHERE cm.class_id = $1
       GROUP BY u.id, u.name
       ORDER BY total_score DESC NULLS LAST, avg_percentage DESC NULLS LAST`,
      [req.params.classId]
    );
    // Add numeric rank (1-based)
    const rows = result.rows.map((r, i) => ({ ...r, rank: i + 1 }));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

// GET leaderboard for a specific quiz (deduplicated: best score per student)
router.get('/:classId/quizzes/:quizId/leaderboard', authenticateToken, async (req, res) => {
  try {
    const quizInfo = await pool.query('SELECT title FROM quizzes WHERE id=$1', [req.params.quizId]);
    const result = await pool.query(
      `WITH best_attempts AS (
         SELECT DISTINCT ON (student_id)
           id AS attempt_id, student_id, score, total, attempted_at
         FROM quiz_attempts
         WHERE quiz_id = $1
         ORDER BY student_id, score DESC, attempted_at ASC
       )
       SELECT
         ba.attempt_id, u.id AS student_id, u.name AS student_name,
         ba.score, ba.total,
         ROUND(ba.score::numeric / NULLIF(ba.total,0) * 100) AS percentage,
         ba.attempted_at,
         ROW_NUMBER() OVER (ORDER BY ba.score DESC, ba.attempted_at ASC)::int AS rank
       FROM best_attempts ba
       JOIN users u ON u.id = ba.student_id
       ORDER BY ba.score DESC, ba.attempted_at ASC`,
      [req.params.quizId]
    );
    res.json({
      quiz_title: quizInfo.rows[0]?.title || '',
      entries: result.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

// GET my badges
router.get('/my-badges', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sb.*, q.title AS quiz_title, c.name AS class_name
       FROM student_badges sb
       LEFT JOIN quizzes q ON q.id = sb.quiz_id
       LEFT JOIN classes c ON c.id = sb.class_id
       WHERE sb.student_id = $1 ORDER BY sb.awarded_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

// GET top scorer per quiz for a class (used on dashboard cards)
router.get('/:classId/top-scorers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (q.id)
         q.id AS quiz_id,
         q.title AS quiz_title,
         u.name AS top_student,
         qa.score,
         qa.total,
         ROUND(qa.score::numeric / NULLIF(qa.total,0) * 100) AS percentage
       FROM quizzes q
       JOIN quiz_attempts qa ON qa.quiz_id = q.id
       JOIN users u ON u.id = qa.student_id
       WHERE q.class_id = $1
       ORDER BY q.id, qa.score DESC, qa.attempted_at ASC`,
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

// GET termly (3 months) composition leaderboard with auto best-composition pick
router.get('/:classId/composition-leaderboard', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ error: 'Invalid class id.' });

    const classCheck = await pool.query('SELECT id FROM classes WHERE id = $1', [classId]);
    if (classCheck.rowCount === 0) return res.status(404).json({ error: 'Class not found.' });

    const result = await pool.query(
      `SELECT
         s.id AS composition_id,
         s.student_id,
         s.content,
         s.created_at,
         u.name AS student_name
       FROM student_shares s
       JOIN class_members cm ON cm.student_id = s.student_id AND cm.class_id = $1
       JOIN users u ON u.id = s.student_id
       WHERE s.type = 'composition'
         AND s.created_at >= NOW() - INTERVAL '3 months'
       ORDER BY s.created_at DESC`,
      [classId]
    );

    const byStudent = new Map();
    for (const row of result.rows) {
      const scored = scoreComposition(row.content || '');
      const candidate = {
        composition_id: row.composition_id,
        student_id: row.student_id,
        student_name: row.student_name,
        composition_title: scored.parsed.title || 'Untitled Composition',
        score: scored.score,
        word_count: scored.word_count,
        paragraph_count: scored.paragraph_count,
        submitted_at: row.created_at,
        reward_eligible: scored.word_count >= 500,
        criteria: scored.criteria,
      };

      const current = byStudent.get(row.student_id);
      if (!current) {
        byStudent.set(row.student_id, candidate);
        continue;
      }

      if (
        candidate.score > current.score ||
        (candidate.score === current.score && candidate.word_count > current.word_count)
      ) {
        byStudent.set(row.student_id, candidate);
      }
    }

    const standings = [...byStudent.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.word_count !== a.word_count) return b.word_count - a.word_count;
      return new Date(a.submitted_at) - new Date(b.submitted_at);
    }).map((row, idx) => ({ ...row, rank: idx + 1 }));

    const eligible = standings.filter((s) => s.reward_eligible);
    const winner = (eligible[0] || standings[0] || null);

    const now = new Date();
    const termStart = new Date(now);
    termStart.setMonth(termStart.getMonth() - 3);

    res.json({
      term_months: 3,
      term_start: termStart.toISOString(),
      term_end: now.toISOString(),
      winner: winner
        ? {
            ...winner,
            title: 'Composition Winner',
            reward: winner.reward_eligible ? 'Term notebooks' : 'No reward (minimum 500 words required)',
          }
        : null,
      entries: standings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
