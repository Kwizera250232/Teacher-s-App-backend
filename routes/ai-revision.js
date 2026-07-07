const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// ── Schema migration (safe to run on existing DB) ────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS ai_revision_sessions (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    education_level VARCHAR(20) NOT NULL,
    grade VARCHAR(20) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    quiz_type VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    num_questions INTEGER NOT NULL,
    question_ids INTEGER[] NOT NULL,
    source_quiz_ids INTEGER[] NOT NULL,
    score INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    percentage INTEGER DEFAULT 0,
    grade_label VARCHAR(5),
    answers JSONB,
    ai_feedback TEXT,
    summary_notes TEXT,
    reflection_difficulty TEXT,
    reflection_improvement TEXT,
    reflection_question TEXT,
    time_taken_seconds INTEGER,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_ai_rev_student ON ai_revision_sessions(student_id);
  CREATE INDEX IF NOT EXISTS idx_ai_rev_subject ON ai_revision_sessions(subject);
`).catch(e => console.error('[ai-revision] schema:', e.message));

// Add columns if they don't exist (for existing tables)
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS summary_notes TEXT`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS reflection_difficulty TEXT`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS reflection_improvement TEXT`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS reflection_question TEXT`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS share_token VARCHAR(64)`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS grade_letter VARCHAR(5)`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS performance_level VARCHAR(50)`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS correct_count INTEGER DEFAULT 0`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS wrong_count INTEGER DEFAULT 0`).catch(() => {});
pool.query(`ALTER TABLE ai_revision_sessions ADD COLUMN IF NOT EXISTS admin_reply TEXT`).catch(() => {});

// ── Gemini AI helper ──────────────────────────────────────────────────────────
async function callGemini(prompt, maxTokens = 1024) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── GET subjects and grades available ─────────────────────────────────────────
router.get('/options', authenticateToken, async (req, res) => {
  try {
    const isAlumni = req.user.role === 'alumni';
    const userRes = await pool.query('SELECT is_external FROM users WHERE id=$1', [req.user.id]);
    const isExternal = userRes.rows.length > 0 && userRes.rows[0].is_external;
    const showAll = isAlumni || isExternal;
    const subjects = showAll
      ? await pool.query(`SELECT DISTINCT subject FROM classes WHERE subject IS NOT NULL ORDER BY subject`)
      : await pool.query(
          `SELECT DISTINCT c.subject FROM classes c
           JOIN class_members cm ON cm.class_id = c.id
           WHERE cm.student_id = $1 AND c.subject IS NOT NULL
           ORDER BY c.subject`,
          [req.user.id]
        );
    const classes = showAll
      ? await pool.query(`SELECT id, name, subject FROM classes ORDER BY name LIMIT 100`)
      : await pool.query(
          `SELECT c.id, c.name, c.subject FROM classes c
           JOIN class_members cm ON cm.class_id = c.id
           WHERE cm.student_id = $1 ORDER BY c.name`,
          [req.user.id]
        );
    res.json({
      subjects: subjects.rows.map(r => r.subject),
      classes: classes.rows,
    });
  } catch (err) {
    console.error('[ai-revision/options]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST generate a revision quiz ─────────────────────────────────────────────
router.post('/generate', authenticateToken, requireRole('student', 'alumni', 'teacher', 'guest'), async (req, res) => {
  const { education_level, grade, subject, quiz_type, difficulty, num_questions } = req.body;

  if (!education_level || !grade || !subject || !quiz_type || !difficulty || !num_questions) {
    return res.status(400).json({ error: 'All selection fields are required.' });
  }

  const targetCount = Math.min(Math.max(parseInt(num_questions) || 10, 5), 100);

  try {
    // Find the student's classes that match the subject
    const studentClasses = await pool.query(
      `SELECT c.id, c.name, c.subject FROM classes c
       JOIN class_members cm ON cm.class_id = c.id
       WHERE cm.student_id = $1 AND c.subject ILIKE $2
       ORDER BY c.name`,
      [req.user.id, `%${subject}%`]
    );

    const classIds = studentClasses.rows.map(c => c.id);

    // Also search all classes with matching subject (broader pool for revision)
    const allMatchingClasses = await pool.query(
      `SELECT id FROM classes WHERE subject ILIKE $1`,
      [`%${subject}%`]
    );
    const allClassIds = allMatchingClasses.rows.map(c => c.id);

    // Search pool: all class IDs with matching subject
    const searchClassIds = allClassIds.length > 0 ? allClassIds : classIds;
    if (searchClassIds.length === 0) {
      return res.status(404).json({ error: 'No quizzes found for this subject. Ask your teacher to create some quizzes first!' });
    }

    // Build the question query based on quiz_type
    let quizFilter = '';
    let queryParams = [searchClassIds];

    if (quiz_type === 'past_papers') {
      // Prioritize quizzes whose title suggests past papers / national exams
      quizFilter = `AND (q.title ILIKE '%past%' OR q.title ILIKE '%exam%' OR q.title ILIKE '%national%' OR q.title ILIKE '%paper%')`;
    } else if (quiz_type === 'practice') {
      quizFilter = `AND (q.title NOT ILIKE '%past%' AND q.title NOT ILIKE '%exam%' AND q.title NOT ILIKE '%national%')`;
    }
    // mixed_revision and topic_based: no extra filter

    // Fetch questions from matching quizzes
    const questionsRes = await pool.query(
      `SELECT qq.id, qq.question, qq.option_a, qq.option_b, qq.option_c, qq.option_d,
              qq.correct_answer, qq.question_type, qq.passage, qq.order_num,
              q.id as quiz_id, q.title as quiz_title, q.class_id
       FROM quiz_questions qq
       JOIN quizzes q ON q.id = qq.quiz_id
       WHERE q.class_id = ANY($1::int[]) ${quizFilter}
       ORDER BY RANDOM()
       LIMIT $2`,
      [searchClassIds, targetCount * 3] // fetch more than needed for filtering
    );

    let questions = questionsRes.rows;

    if (questions.length === 0) {
      // Fallback: try without the quiz_type filter
      const fallbackRes = await pool.query(
        `SELECT qq.id, qq.question, qq.option_a, qq.option_b, qq.option_c, qq.option_d,
                qq.correct_answer, qq.question_type, qq.passage, qq.order_num,
                q.id as quiz_id, q.title as quiz_title, q.class_id
         FROM quiz_questions qq
         JOIN quizzes q ON q.id = qq.quiz_id
         WHERE q.class_id = ANY($1::int[])
         ORDER BY RANDOM()
         LIMIT $2`,
        [searchClassIds, targetCount]
      );
      questions = fallbackRes.rows;
    }

    if (questions.length === 0) {
      return res.status(404).json({ error: 'No questions available for this subject yet. Your teachers need to create some quizzes first!' });
    }

    // Difficulty filtering (simple heuristic: shuffle and pick)
    // In a real system, questions would have a difficulty tag. For now, we use randomization.
    // Shuffle questions
    questions = questions.sort(() => Math.random() - 0.5);

    // Limit to target count
    const selectedQuestions = questions.slice(0, targetCount);

    // Re-number questions
    const numberedQuestions = selectedQuestions.map((q, i) => ({
      ...q,
      display_number: i + 1,
    }));

    // Collect source quiz IDs
    const sourceQuizIds = [...new Set(selectedQuestions.map(q => q.quiz_id))];

    // Create a session record
    const sessionRes = await pool.query(
      `INSERT INTO ai_revision_sessions
       (student_id, education_level, grade, subject, quiz_type, difficulty, num_questions, question_ids, source_quiz_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        req.user.id, education_level, grade, subject, quiz_type, difficulty,
        selectedQuestions.length,
        selectedQuestions.map(q => q.id),
        sourceQuizIds,
      ]
    );
    const sessionId = sessionRes.rows[0].id;

    // Strip correct_answer from questions sent to frontend
    const safeQuestions = numberedQuestions.map(q => ({
      id: q.id,
      question: q.question,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      question_type: q.question_type,
      passage: q.passage,
      display_number: q.display_number,
      quiz_title: q.quiz_title,
    }));

    res.json({
      session_id: sessionId,
      questions: safeQuestions,
      source_quizzes: sourceQuizIds.length,
      total_questions: safeQuestions.length,
    });
  } catch (err) {
    console.error('[ai-revision/generate]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST submit revision quiz ─────────────────────────────────────────────────
router.post('/submit', authenticateToken, requireRole('student', 'alumni', 'teacher', 'guest'), async (req, res) => {
  const { session_id, answers, time_taken_seconds } = req.body;

  if (!session_id || !answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Session ID and answers are required.' });
  }

  try {
    // Get the session
    const sessionRes = await pool.query(
      'SELECT * FROM ai_revision_sessions WHERE id=$1 AND student_id=$2',
      [session_id, req.user.id]
    );
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const session = sessionRes.rows[0];

    if (session.completed_at) {
      return res.status(409).json({ error: 'This revision session has already been submitted.' });
    }

    // Get the questions with correct answers
    const questionIds = session.question_ids;
    const questionsRes = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d,
              correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE id = ANY($1::int[])`,
      [questionIds]
    );

    // Build a map for ordering by original question_ids order
    const qMap = {};
    questionsRes.rows.forEach(q => { qMap[q.id] = q; });

    let score = 0;
    const detailed = [];

    for (let i = 0; i < questionIds.length; i++) {
      const qid = questionIds[i];
      const q = qMap[qid];
      if (!q) continue;

      const given = String(answers[qid] ?? '');
      const correct = q.correct_answer;
      let isCorrect = false;

      if (q.question_type === 'fill_blank') {
        isCorrect = given.trim().toLowerCase() === (correct || '').trim().toLowerCase();
      } else if (q.question_type === 'matching') {
        try {
          const pairs = JSON.parse(q.passage || '[]');
          const givenParts = given.split('|');
          isCorrect = pairs.length > 0 && pairs.every((pair, idx) =>
            (givenParts[idx] || '').trim().toLowerCase() === pair.right.trim().toLowerCase()
          );
        } catch (e) { isCorrect = false; }
      } else {
        isCorrect = given.toLowerCase() === (correct || '').toLowerCase();
      }

      if (isCorrect) score++;

      detailed.push({
        question_id: q.id,
        number: i + 1,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        student_answer: given,
        question_type: q.question_type,
        passage: q.passage,
        is_correct: isCorrect,
      });
    }

    const total = questionIds.length;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

    // Determine grade
    let gradeLabel = 'F';
    if (percentage >= 90) gradeLabel = 'A+';
    else if (percentage >= 80) gradeLabel = 'A';
    else if (percentage >= 70) gradeLabel = 'B';
    else if (percentage >= 60) gradeLabel = 'C';
    else if (percentage >= 50) gradeLabel = 'D';
    else if (percentage >= 40) gradeLabel = 'E';

    // Performance level
    let performanceLevel = 'Needs Improvement';
    if (percentage >= 90) performanceLevel = 'Excellent';
    else if (percentage >= 75) performanceLevel = 'Very Good';
    else if (percentage >= 60) performanceLevel = 'Good';
    else if (percentage >= 40) performanceLevel = 'Fair';

    const wrongCount = total - score;

    // Generate AI feedback using Gemini
    let aiFeedback = '';
    try {
      const wrongQuestions = detailed.filter(d => !d.is_correct).map(d =>
        `Q${d.number}: ${d.question?.substring(0, 100)}... (Correct: ${d.correct_answer})`
      );
      const correctQuestions = detailed.filter(d => d.is_correct).length;

      const prompt = `You are an education AI assistant for Rwandan students. Analyze this quiz result and give personalized feedback in English (max 200 words).

Student: ${session.education_level} ${session.grade}, Subject: ${session.subject}
Score: ${score}/${total} (${percentage}%) - Grade: ${gradeLabel}
Correct: ${correctQuestions}, Wrong: ${wrongQuestions.length}

Questions the student got wrong:
${wrongQuestions.join('\n') || 'None - perfect score!'}

Provide:
1. Overall performance summary (1 sentence)
2. Strong areas (if any)
3. Weak areas that need improvement
4. Specific recommendation for next steps

Keep it encouraging and specific. Use simple English that a ${session.grade} student can understand.`;

      aiFeedback = await callGemini(prompt, 800);
    } catch (e) {
      console.error('[ai-revision/feedback]', e.message);
      // Fallback feedback without AI
      aiFeedback = `You scored ${percentage}%. ${performanceLevel} performance. ${percentage >= 60 ? 'Keep up the good work!' : 'Keep practicing to improve your scores.'} ${wrongCount > 0 ? `Review the ${wrongCount} questions you got wrong and try again.` : ''}`;
    }

    // Generate AI summary notes for difficult topics
    let summaryNotes = '';
    try {
      const wrongFull = detailed.filter(d => !d.is_correct);
      if (wrongFull.length > 0) {
        const wrongList = wrongFull.map(d =>
          `Question: ${d.question}\nCorrect answer: ${d.correct_answer}\nYour answer: ${d.student_answer || '(blank)'}\nType: ${d.question_type}`
        ).join('\n---\n');

        const notesPrompt = `You are an education AI assistant creating study notes for a ${session.grade} student in ${session.subject}. The student got these questions wrong on a quiz. Create concise summary notes (max 400 words) that explain the concepts they struggled with.

Wrong questions:
${wrongList}

Format the notes as:
## Summary Notes: Difficult Topics

For each topic/concept the student struggled with:
- Topic name as a heading (##)
- Brief explanation of the concept (2-3 sentences)
- Key points to remember (bullet points)
- A simple example

End with "### Next Steps" and 2-3 specific study recommendations.
Use simple English that a ${session.grade} student can understand.`;

        summaryNotes = await callGemini(notesPrompt, 1200);
      } else {
        summaryNotes = '## Summary Notes\n\nExcellent work! You answered all questions correctly. No difficult topics to review. Keep up the great work!';
      }
    } catch (e) {
      console.error('[ai-revision/summary-notes]', e.message);
    }

    // Update session
    await pool.query(
      `UPDATE ai_revision_sessions
       SET score=$1, total=$2, percentage=$3, grade_label=$4, answers=$5,
           ai_feedback=$6, summary_notes=$7, time_taken_seconds=$8, completed_at=NOW()
       WHERE id=$9`,
      [score, total, percentage, gradeLabel, JSON.stringify(answers), aiFeedback,
       summaryNotes, time_taken_seconds || null, session_id]
    );

    res.json({
      session_id,
      score,
      total,
      percentage,
      grade: gradeLabel,
      performance_level: performanceLevel,
      detailed,
      ai_feedback: aiFeedback,
      summary_notes: summaryNotes,
      correct_count: score,
      wrong_count: wrongCount,
    });
  } catch (err) {
    console.error('[ai-revision/submit]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST reflection after quiz ───────────────────────────────────────────────
router.post('/reflection', authenticateToken, requireRole('student', 'alumni', 'teacher', 'guest'), async (req, res) => {
  const { session_id, difficulty, improvement, student_question } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }
  try {
    const result = await pool.query(
      `UPDATE ai_revision_sessions
       SET reflection_difficulty=$1, reflection_improvement=$2, reflection_question=$3
       WHERE id=$4 AND student_id=$5 RETURNING id`,
      [difficulty || null, improvement || null, student_question || null, session_id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[ai-revision/reflection]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET progress history ──────────────────────────────────────────────────────
router.get('/progress', authenticateToken, requireRole('student', 'alumni', 'teacher', 'guest'), async (req, res) => {
  try {
    const sessions = await pool.query(
      `SELECT id, subject, quiz_type, difficulty, score, total, percentage, grade_label,
              ai_feedback, summary_notes, time_taken_seconds, started_at, completed_at
       FROM ai_revision_sessions
       WHERE student_id=$1 AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 50`,
      [req.user.id]
    );

    // Compute stats
    const all = sessions.rows;
    const totalAttempts = all.length;
    const avgScore = totalAttempts > 0 ? Math.round(all.reduce((s, r) => s + r.percentage, 0) / totalAttempts) : 0;
    const bestScore = totalAttempts > 0 ? Math.max(...all.map(r => r.percentage)) : 0;

    // Subject breakdown
    const subjectMap = {};
    all.forEach(r => {
      if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, scores: [] };
      subjectMap[r.subject].total++;
      subjectMap[r.subject].scores.push(r.percentage);
    });

    const subjectStats = Object.entries(subjectMap).map(([subject, data]) => ({
      subject,
      attempts: data.total,
      average: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.total),
      best: Math.max(...data.scores),
    })).sort((a, b) => b.attempts - a.attempts);

    // Strongest and weakest subjects
    const sorted = [...subjectStats].sort((a, b) => b.average - a.average);
    const strongest = sorted.filter(s => s.average >= 60).slice(0, 3);
    const weakest = sorted.filter(s => s.average < 60).slice(-3).reverse();

    // Progress over time (chronological)
    const chronological = [...all].reverse().map(r => ({
      date: r.completed_at,
      percentage: r.percentage,
      subject: r.subject,
    }));

    res.json({
      sessions: all,
      stats: {
        total_attempts: totalAttempts,
        average_score: avgScore,
        best_score: bestScore,
        subject_stats: subjectStats,
        strongest_subjects: strongest,
        weakest_subjects: weakest,
        progress_over_time: chronological,
      },
    });
  } catch (err) {
    console.error('[ai-revision/progress]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET single session result ─────────────────────────────────────────────────
router.get('/result/:sessionId', authenticateToken, requireRole('student', 'alumni', 'teacher', 'guest'), async (req, res) => {
  try {
    const sessionRes = await pool.query(
      `SELECT * FROM ai_revision_sessions WHERE id=$1 AND student_id=$2`,
      [req.params.sessionId, req.user.id]
    );
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const session = sessionRes.rows[0];

    // Get questions with details
    const questionsRes = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d,
              correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE id = ANY($1::int[])`,
      [session.question_ids]
    );
    const qMap = {};
    questionsRes.rows.forEach(q => { qMap[q.id] = q; });

    const detailed = session.question_ids.map((qid, i) => {
      const q = qMap[qid];
      if (!q) return null;
      const given = String((session.answers || {})[qid] ?? '');
      let isCorrect = false;
      if (q.question_type === 'fill_blank') {
        isCorrect = given.trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase();
      } else if (q.question_type === 'matching') {
        try {
          const pairs = JSON.parse(q.passage || '[]');
          const givenParts = given.split('|');
          isCorrect = pairs.length > 0 && pairs.every((pair, idx) =>
            (givenParts[idx] || '').trim().toLowerCase() === pair.right.trim().toLowerCase()
          );
        } catch (e) { isCorrect = false; }
      } else {
        isCorrect = given.toLowerCase() === (q.correct_answer || '').toLowerCase();
      }
      return {
        question_id: q.id,
        number: i + 1,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        student_answer: given,
        question_type: q.question_type,
        passage: q.passage,
        is_correct: isCorrect,
      };
    }).filter(Boolean);

    res.json({
      ...session,
      detailed,
    });
  } catch (err) {
    console.error('[ai-revision/result]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET adaptive recommendation ───────────────────────────────────────────────
router.get('/recommend', authenticateToken, requireRole('student', 'alumni', 'teacher', 'guest'), async (req, res) => {
  try {
    // Get recent sessions
    const recent = await pool.query(
      `SELECT subject, percentage, quiz_type, difficulty FROM ai_revision_sessions
       WHERE student_id=$1 AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 10`,
      [req.user.id]
    );

    if (recent.rows.length === 0) {
      return res.json({
        recommended_difficulty: 'mixed',
        recommended_subject: null,
        reason: 'Take your first revision quiz to get personalized recommendations!',
        recommended_count: 10,
      });
    }

    // Find weakest subject
    const subjectMap = {};
    recent.rows.forEach(r => {
      if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, scores: [] };
      subjectMap[r.subject].total++;
      subjectMap[r.subject].scores.push(r.percentage);
    });

    const subjectAvgs = Object.entries(subjectMap).map(([subject, data]) => ({
      subject,
      average: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.total),
    }));

    const weakest = subjectAvgs.sort((a, b) => a.average - b.average)[0];
    const strongest = subjectAvgs.sort((a, b) => b.average - a.average)[0];

    // Recommend difficulty based on recent performance
    const recentAvg = Math.round(recent.rows.reduce((s, r) => s + r.percentage, 0) / recent.rows.length);
    let recommendedDifficulty = 'mixed';
    if (recentAvg < 50) recommendedDifficulty = 'easy';
    else if (recentAvg >= 85) recommendedDifficulty = 'hard';

    const reason = `Based on your recent ${recent.rows.length} attempts (avg ${recentAvg}%), we recommend ${recommendedDifficulty === 'mixed' ? 'a mix of' : recommendedDifficulty} questions${weakest ? ` in ${weakest.subject} where you average ${weakest.average}%` : ''}.`;

    res.json({
      recommended_difficulty: recommendedDifficulty,
      recommended_subject: weakest?.subject || null,
      recommended_count: recentAvg < 50 ? 20 : 10,
      reason,
      recent_average: recentAvg,
      weakest_subject: weakest,
      strongest_subject: strongest,
    });
  } catch (err) {
    console.error('[ai-revision/recommend]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Share AI Revision results ───────────────────────────────────────────────
router.post('/share', authenticateToken, async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required.' });
  try {
    const session = await pool.query(
      `SELECT id, student_id, subject, grade, quiz_type, difficulty, score, total, percentage, grade_letter, performance_level
       FROM ai_revision_sessions WHERE id=$1 AND student_id=$2`,
      [session_id, req.user.id]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    const s = session.rows[0];
    const crypto = require('crypto');
    const shareToken = crypto.randomBytes(16).toString('hex');
    await pool.query(
      `UPDATE ai_revision_sessions SET share_token=$1, is_shared=TRUE WHERE id=$2`,
      [shareToken, s.id]
    );
    res.json({
      share_token: shareToken,
      share_url: `${process.env.FRONTEND_URL || 'https://student.umunsi.com'}/ai-revision/share/${shareToken}`,
      subject: s.subject,
      grade: s.grade,
    });
  } catch (err) {
    console.error('[ai-revision/share]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get shared AI Revision info (public, no auth) ───────────────────────────
router.get('/share/:token', async (req, res) => {
  try {
    const session = await pool.query(
      `SELECT s.subject, s.grade, s.quiz_type, s.difficulty, s.score, s.total, s.percentage,
              s.grade_letter, s.performance_level, s.share_token, s.education_level, s.num_questions,
              u.name as student_name
       FROM ai_revision_sessions s
       JOIN users u ON u.id = s.student_id
       WHERE s.share_token=$1 AND s.is_shared=TRUE`,
      [req.params.token]
    );
    if (session.rows.length === 0) return res.status(404).json({ error: 'Shared quiz not found.' });
    const s = session.rows[0];
    // If no completed_at, it's a quiz config share (no results yet)
    const isQuizOnly = s.score === null && s.total === null;
    res.json({
      ...s,
      is_quiz_only: isQuizOnly,
    });
  } catch (err) {
    console.error('[ai-revision/share/:token]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Share quiz config (no session needed) ───────────────────────────────────
router.post('/share-quiz', authenticateToken, async (req, res) => {
  const { education_level, grade, subject, quiz_type, difficulty, num_questions } = req.body;
  if (!subject || !grade) return res.status(400).json({ error: 'Subject and grade required.' });
  try {
    const crypto = require('crypto');
    const shareToken = crypto.randomBytes(16).toString('hex');
    const result = await pool.query(
      `INSERT INTO ai_revision_sessions (student_id, education_level, subject, quiz_type, difficulty, grade, num_questions, question_ids, source_quiz_ids, share_token, is_shared, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW()) RETURNING id`,
      [req.user.id, education_level || 'secondary', subject, quiz_type || 'mixed_revision', difficulty || 'mixed', grade, num_questions || 10, '{}', '{}', shareToken]
    );
    res.json({
      share_token: shareToken,
      share_url: `${process.env.FRONTEND_URL || 'https://student.umunsi.com'}/ai-revision/share/${shareToken}`,
      session_id: result.rows[0].id,
    });
  } catch (err) {
    console.error('[ai-revision/share-quiz]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: List all AI revision sessions with student info ─────────────────
router.get('/admin/sessions', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.student_id, s.subject, s.quiz_type, s.difficulty, s.grade,
             s.score, s.total, s.percentage, s.grade_letter, s.performance_level,
             s.ai_feedback, s.summary_notes, s.reflection_difficulty,
             s.reflection_improvement, s.reflection_question, s.admin_reply,
             s.started_at, s.completed_at, s.is_shared,
             u.name as student_name, u.email as student_email, u.role as student_role
      FROM ai_revision_sessions s
      JOIN users u ON u.id = s.student_id
      WHERE s.completed_at IS NOT NULL
      ORDER BY s.completed_at DESC
      LIMIT 200
    `);
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('[ai-revision/admin/sessions]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Get session detail ──────────────────────────────────────────────
router.get('/admin/sessions/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const sessionRes = await pool.query(`
      SELECT s.*, u.name as student_name, u.email as student_email, u.role as student_role
      FROM ai_revision_sessions s
      JOIN users u ON u.id = s.student_id
      WHERE s.id=$1
    `, [req.params.id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    res.json(sessionRes.rows[0]);
  } catch (err) {
    console.error('[ai-revision/admin/session]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Reply to student feedback/reflection ────────────────────────────
router.post('/admin/sessions/:id/reply', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { reply } = req.body;
  if (!reply?.trim()) return res.status(400).json({ error: 'Reply text is required.' });
  try {
    const result = await pool.query(
      `UPDATE ai_revision_sessions SET admin_reply=$1 WHERE id=$2 RETURNING id`,
      [reply.trim(), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    // Notify student
    const session = await pool.query('SELECT student_id, subject FROM ai_revision_sessions WHERE id=$1', [req.params.id]);
    if (session.rows.length > 0) {
      await pool.query(
        `INSERT INTO user_notifications (user_id, type, title, body, payload) VALUES ($1,$2,$3,$4,$5)`,
        [session.rows[0].student_id, 'admin_reply', `Admin replied to your ${session.rows[0].subject} quiz feedback`, reply.trim().slice(0, 200), JSON.stringify({ session_id: parseInt(req.params.id) })]
      ).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[ai-revision/admin/reply]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Stats summary ───────────────────────────────────────────────────
router.get('/admin/stats', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const [total, bySubject, byGrade, avgScore, recentActivity] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM ai_revision_sessions WHERE completed_at IS NOT NULL'),
      pool.query('SELECT subject, COUNT(*) as count, AVG(percentage) as avg_score FROM ai_revision_sessions WHERE completed_at IS NOT NULL GROUP BY subject ORDER BY count DESC LIMIT 10'),
      pool.query('SELECT grade, COUNT(*) as count FROM ai_revision_sessions WHERE completed_at IS NOT NULL GROUP BY grade ORDER BY count DESC'),
      pool.query('SELECT AVG(percentage) as avg_score, COUNT(*) as total FROM ai_revision_sessions WHERE completed_at IS NOT NULL'),
      pool.query(`SELECT DATE(completed_at) as day, COUNT(*) as count FROM ai_revision_sessions WHERE completed_at IS NOT NULL AND completed_at > NOW() - INTERVAL '14 days' GROUP BY day ORDER BY day`),
    ]);
    res.json({
      total_sessions: total.rows[0].total,
      by_subject: bySubject.rows,
      by_grade: byGrade.rows,
      avg_score: parseFloat(avgScore.rows[0].avg_score || 0).toFixed(1),
      recent_activity: recentActivity.rows,
    });
  } catch (err) {
    console.error('[ai-revision/admin/stats]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
