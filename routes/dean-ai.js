const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');

// Gemini AI helper - uses REST API directly (no SDK needed)
async function callGemini(prompt, maxTokens = 2048) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[Gemini API error]', res.status, errText);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || '';
}

// ── Chat with Dean AI (answer any question) ──
router.post('/chat', authenticateToken, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    const systemPrompt = `You are Dean AI, the intelligent learning companion for UClass (student.umunsi.com) — Rwanda's leading education platform.

You help students, alumni, and learners with:
- Answering ANY question about school subjects (Math, Science, English, Kinyarwanda, Social Studies, French, ICT, etc.)
- Explaining concepts clearly and simply
- Helping with homework and assignments
- Preparing practice quizzes and exercises
- Giving study tips and learning strategies
- Career guidance for alumni

RULES:
1. Reply in the same language the user uses (English or Kinyarwanda)
2. Be friendly, encouraging, and educational
3. For homework: guide step by step, explain the method
4. Keep answers clear and appropriate for the student's level
5. If asked about UClass app features, explain them helpfully
6. You are "Dean AI" — the smart assistant that makes learning fun on UClass

User question: ${message}

${history.length > 0 ? 'Previous context: ' + history.slice(-3).map(h => `${h.role}: ${h.content}`).join('\n') : ''}

Answer helpfully and accurately:`;

    const reply = await callGemini(systemPrompt, 1024);
    res.json({ reply: reply.trim() });
  } catch (err) {
    console.error('[dean-ai/chat]', err.message);
    res.status(503).json({ error: 'AI service unavailable. Please try again.' });
  }
});

// ── Generate a Quiz using AI ──
router.post('/generate-quiz', authenticateToken, async (req, res) => {
  const { subject, grade, topic, count = 5 } = req.body;

  try {
    const prompt = `You are a quiz generator for UClass (student.umunsi.com), Rwanda's education platform.

Create a ${count}-question multiple choice quiz about "${subject || 'General Knowledge'}"${grade ? ` for ${grade}` : ''}${topic ? ` on the topic of ${topic}` : ''}.

Follow the Rwanda education curriculum. Make questions appropriate for the grade level.

Return ONLY valid JSON in this exact format (no markdown, no code blocks, just JSON):
{
  "title": "Quiz title here",
  "subject": "${subject || 'General'}",
  "questions": [
    {
      "question": "The question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Generate exactly ${count} questions. Make them challenging but fair. Include a mix of easy and medium questions.`;

    const response = await callGemini(prompt, 4096);

    // Extract JSON from response (handle if AI wraps in code blocks)
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const quiz = JSON.parse(jsonStr);

    // Validate structure
    if (!quiz.questions || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      throw new Error('Invalid quiz format from AI');
    }

    // Add IDs to questions
    quiz.questions = quiz.questions.map((q, i) => ({
      id: `ai_q_${i}`,
      ...q,
    }));

    quiz.id = `ai_quiz_${Date.now()}`;
    quiz.is_ai_generated = true;

    res.json({ quiz, questions: quiz.questions });
  } catch (err) {
    console.error('[dean-ai/generate-quiz]', err.message);
    res.status(503).json({ error: 'Could not generate quiz. Please try again.' });
  }
});

// ── Search teacher quizzes on UClass ──
router.get('/search-quizzes', authenticateToken, async (req, res) => {
  const { subject, grade, q } = req.query;
  try {
    let sql = `SELECT q.id, q.title, q.description, q.subject, q.grade_level, q.created_at,
                      (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count,
                      c.name as class_name
               FROM quizzes q
               LEFT JOIN classes c ON c.id = q.class_id
               WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (subject) {
      sql += ` AND (LOWER(q.subject) LIKE LOWER($${idx}) OR LOWER(q.title) LIKE LOWER($${idx}))`;
      params.push(`%${subject}%`);
      idx++;
    }
    if (grade) {
      sql += ` AND (LOWER(q.grade_level) LIKE LOWER($${idx}) OR LOWER(c.name) LIKE LOWER($${idx}))`;
      params.push(`%${grade}%`);
      idx++;
    }
    if (q) {
      sql += ` AND (LOWER(q.title) LIKE LOWER($${idx}) OR LOWER(q.description) LIKE LOWER($${idx}))`;
      params.push(`%${q}%`);
      idx++;
    }

    sql += ` ORDER BY q.created_at DESC LIMIT 20`;

    const result = await db.query(sql, params);
    res.json({ quizzes: result.rows });
  } catch (err) {
    console.error('[dean-ai/search-quizzes]', err.message);
    res.json({ quizzes: [] });
  }
});

// ── Get quiz questions (for teacher quizzes) ──
router.get('/quiz/:id/questions', authenticateToken, async (req, res) => {
  try {
    const quizRes = await db.query('SELECT * FROM quizzes WHERE id=$1', [req.params.id]);
    if (quizRes.rows.length === 0) return res.status(404).json({ error: 'Quiz not found' });

    const qRes = await db.query('SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY id', [req.params.id]);
    const questions = qRes.rows.map(q => ({
      id: q.id,
      question: q.question_text || q.question,
      question_text: q.question_text || q.question,
      options: [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean),
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
    }));

    res.json({ quiz: quizRes.rows[0], questions });
  } catch (err) {
    console.error('[dean-ai/quiz-questions]', err.message);
    res.status(500).json({ error: 'Failed to load quiz' });
  }
});

module.exports = router;
