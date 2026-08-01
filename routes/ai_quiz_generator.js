const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');

const router = express.Router();

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Split large text into chunks that fit within Gemini's context window.
 * We keep chunks at ~12000 chars to leave room for the prompt + response.
 */
function chunkText(text, maxChars = 12000) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    // Try to break at a newline or sentence boundary
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      const dot = text.lastIndexOf('. ', end);
      if (nl > start + maxChars * 0.5) end = nl;
      else if (dot > start + maxChars * 0.5) end = dot + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

async function callGeminiWithRetry(url, body, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) return res;

    // Return 429 immediately — frontend handles retry with countdown
    if (res.status === 429) {
      const e = new Error('RATE_LIMITED');
      e.status = 429;
      throw e;
    }

    // Retry 503 (server overloaded) but only briefly
    if (res.status === 503 && attempt < maxRetries) {
      const wait = 2000;
      console.log(`[Gemini] 503 overloaded, retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    // Non-retryable error
    const errText = await res.text();
    console.error('[Gemini] error', res.status, errText.slice(0, 300));
    const e = new Error(`Gemini API error: ${res.status}`);
    e.status = res.status;
    throw e;
  }
}

/**
 * Call Gemini to generate MCQ questions from a chunk of content.
 * Returns array of question objects: { question, option_a, option_b, option_c, option_d, correct_answer }
 */
async function generateQuestionsFromChunk(chunk, chunkIndex, totalChunks, numQuestions, gradeLevel, subject) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const gradeDesc = gradeLevel ? `\nGRADE LEVEL: ${gradeLevel} (Rwandan education system). ${gradeLevel.startsWith('P') ? 'Primary school level — use simple, age-appropriate language and concepts matching the Rwandan curriculum for ' + gradeLevel + '.' : 'Secondary school level — use appropriate depth and complexity matching the Rwandan curriculum for ' + gradeLevel + '.'}` : '';
  const subjectDesc = subject ? `\nSUBJECT: ${subject}. Generate questions strictly related to this subject following the Rwandan national curriculum for ${gradeLevel || 'the selected grade'}.` : '';

  const prompt = `You are an expert exam creator for the Rwandan education system. Your task is to create multiple choice questions (MCQ) from the educational content below.${gradeDesc}${subjectDesc}

IMPORTANT RULES:
1. Create exactly ${numQuestions} multiple choice questions from this content.
2. Do NOT skip any topic or question in the content — every piece of information should be covered.
3. Each question must have exactly 4 options labeled A, B, C, D.
4. The correct answer must be one of A, B, C, or D.
5. Questions should be clear, accurate, and test understanding of the content.
6. Distractors (wrong options) should be plausible but clearly incorrect.
7. If the content already contains questions, convert them into MCQ format with 4 options.
8. If the content contains fill-in-the-blank or short answer questions, create 4 plausible options and mark the correct one.
9. Adapt the difficulty and language to match ${gradeLevel || 'the selected'} level in the Rwandan curriculum.
10. If the pasted content is above or below the selected grade level, simplify or adapt it to match ${gradeLevel || 'the selected grade'} standards.

CONTENT (Part ${chunkIndex + 1} of ${totalChunks}):
"""
${chunk}
"""

Respond ONLY with a valid JSON array. No markdown, no explanation. Each element must have this exact structure:
[
  {
    "question": "The question text here?",
    "option_a": "First option text",
    "option_b": "Second option text",
    "option_c": "Third option text",
    "option_d": "Fourth option text",
    "correct_answer": "a"
  }
]

The "correct_answer" must be lowercase: "a", "b", "c", or "d".`;

  const res = await callGeminiWithRetry(`${GEMINI_URL}?key=${apiKey}`, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192, temperature: 0.4 },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[AI Quiz Gen] Gemini error', res.status, errText);
    throw new Error(`Gemini API error: ${res.status} - ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/```json|```/g, '').trim();

  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        questions = JSON.parse(match[0]);
      } catch {
        console.error('[AI Quiz Gen] Failed to parse chunk', chunkIndex, cleaned.slice(0, 300));
        return [];
      }
    } else {
      console.error('[AI Quiz Gen] No JSON array found in response', cleaned.slice(0, 300));
      return [];
    }
  }

  // Validate and normalize each question
  return questions.filter(q => q.question && q.option_a && q.option_b && q.option_c && q.option_d).map(q => ({
    question: String(q.question).trim(),
    option_a: String(q.option_a).trim(),
    option_b: String(q.option_b).trim(),
    option_c: String(q.option_c).trim(),
    option_d: String(q.option_d).trim(),
    correct_answer: String(q.correct_answer || 'a').toLowerCase().trim().charAt(0),
  }));
}

/**
 * POST /api/classes/:classId/ai-quiz/generate
 * Body: { content: string, title: string, description?: string, grade_level?: string, subject?: string, questions_per_chunk?: number }
 * Generates MCQ quiz from pasted content and saves it as a real quiz in the database.
 */
router.post('/:classId/ai-quiz/generate', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  const { content, title, description, grade_level, subject } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required.' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Quiz title is required.' });
  if (!grade_level || !grade_level.trim()) return res.status(400).json({ error: 'Grade level is required.' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured. Set GEMINI_API_KEY.' });

  try {
    // Chunk the content
    const chunks = chunkText(content.trim());
    const questionsPerChunk = Math.max(5, Math.min(20, Math.ceil(40 / chunks.length)));
    const allQuestions = [];

    for (let i = 0; i < chunks.length; i++) {
      const qs = await generateQuestionsFromChunk(chunks[i], i, chunks.length, questionsPerChunk, grade_level, subject);
      allQuestions.push(...qs);
    }

    if (!allQuestions.length) {
      return res.status(422).json({ error: 'AI could not generate questions from the provided content. Try adding more detail.' });
    }

    // Save as a real quiz in the database
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const quizResult = await client.query(
        'INSERT INTO quizzes (class_id, title, description, grade_level, subject) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [classId, title.trim(), description || null, (grade_level || '').trim() || null, (subject || '').trim() || null]
      );
      const quiz = quizResult.rows[0];

      for (let i = 0; i < allQuestions.length; i++) {
        const q = allQuestions[i];
        await client.query(
          `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, order_num)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [quiz.id, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, 'multiple_choice', i]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        quiz,
        questions: allQuestions,
        message: `Generated ${allQuestions.length} questions from ${chunks.length} chunk(s).`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[AI Quiz Gen]', err);
    if (err.message === 'RATE_LIMITED' || err.status === 429) {
      return res.status(429).json({ error: 'AI is busy. Retrying automatically...' });
    }
    res.status(500).json({ error: err.message || 'Failed to generate quiz.' });
  }
});

/**
 * POST /api/classes/:classId/ai-quiz/preview
 * Body: { content: string, questions_per_chunk?: number }
 * Generates questions but does NOT save — returns preview for teacher to review.
 */
router.post('/:classId/ai-quiz/preview', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  const { content, grade_level, subject } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required.' });
  if (!grade_level || !grade_level.trim()) return res.status(400).json({ error: 'Grade level is required.' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured.' });

  try {
    const chunks = chunkText(content.trim());
    const questionsPerChunk = Math.max(5, Math.min(20, Math.ceil(40 / chunks.length)));
    const allQuestions = [];

    for (let i = 0; i < chunks.length; i++) {
      const qs = await generateQuestionsFromChunk(chunks[i], i, chunks.length, questionsPerChunk, grade_level, subject);
      allQuestions.push(...qs);
    }

    if (!allQuestions.length) {
      return res.status(422).json({ error: 'AI could not generate questions. Try adding more content.' });
    }

    res.json({
      questions: allQuestions,
      chunks: chunks.length,
      message: `Generated ${allQuestions.length} questions from ${chunks.length} chunk(s).`,
    });
  } catch (err) {
    console.error('[AI Quiz Preview]', err);
    if (err.message === 'RATE_LIMITED' || err.status === 429) {
      return res.status(429).json({ error: 'AI is busy. Retrying automatically...' });
    }
    res.status(500).json({ error: err.message || 'Failed to generate preview.' });
  }
});

module.exports = router;

/**
 * POST /api/classes/:classId/ai-quiz/auto-generate
 * Body: { title, description?, grade_level, subject, num_questions?: number }
 * AI generates quiz questions on its own from the Rwandan curriculum — no content needed from teacher.
 */
router.post('/:classId/ai-quiz/auto-generate', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  const { title, description, grade_level, subject, num_questions, preview_only } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Quiz title is required.' });
  if (!grade_level || !grade_level.trim()) return res.status(400).json({ error: 'Grade level is required.' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured.' });

  const totalQuestions = Math.min(50, Math.max(5, parseInt(num_questions, 10) || 20));

  const isPrimary = grade_level.startsWith('P');
  const levelDesc = isPrimary
    ? `Primary ${grade_level} level in Rwanda. Use simple, age-appropriate language. Topics should match what a ${grade_level} student learns in the Rwandan primary curriculum.`
    : `Secondary ${grade_level} level in Rwanda. Use appropriate academic depth. Topics should match the Rwandan secondary curriculum for ${grade_level}, following CBC (Competence-Based Curriculum).`;

  const prompt = `You are an expert exam creator for the Rwandan education system with deep knowledge of Rwandan national exams (Akarere ka Rwanda exams, National Examinations).

TASK: Create ${totalQuestions} multiple choice questions (MCQ) for ${subject} at ${levelDesc}

CRITICAL RULES — FOLLOW EXACTLY:
1. Search your knowledge for ACTUAL past Rwandan national exam questions for ${grade_level} ${subject}. Use real questions from past national exams (Primary Leaving Exam, O-Level, A-Level, etc.) where available.
2. If you know actual past exam questions, use them EXACTLY as they appeared — same wording, same options, same correct answer.
3. If you cannot recall a specific past exam question, create questions that MATCH the style, difficulty, and content of real Rwandan national exams for this level and subject.
4. Create exactly ${totalQuestions} questions — do NOT generate fewer.
5. Each question must have exactly 4 options labeled A, B, C, D.
6. The correct answer must be one of A, B, C, or D — and must be factually accurate.
7. Questions must be at the correct difficulty level for ${grade_level} in the Rwandan curriculum.
8. Cover topics that actually appear in Rwandan national exams for this level and subject.
9. Distractors (wrong options) should be plausible — similar to how real exam distractors are designed.
10. Use English as the primary language unless the subject is Kinyarwanda or French.
11. Make sure every question is factually correct — the answer must be verifiable from the Rwandan curriculum.

Respond ONLY with a valid JSON array. No markdown, no explanation. Each element must have this exact structure:
[
  {
    "question": "The question text here?",
    "option_a": "First option text",
    "option_b": "Second option text",
    "option_c": "Third option text",
    "option_d": "Fourth option text",
    "correct_answer": "a"
  }
]

The "correct_answer" must be lowercase: "a", "b", "c", or "d".`;

  try {
    const url = `${GEMINI_URL}?key=${apiKey}`;
    const aiRes = await callGeminiWithRetry(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('[AI Quiz Auto-Gen] Gemini error', aiRes.status, errText);
      return res.status(502).json({ error: `AI error: ${aiRes.status}` });
    }

    const data = await aiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = text.replace(/```json|```/g, '').trim();

    let allQuestions;
    try {
      allQuestions = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        try { allQuestions = JSON.parse(match[0]); }
        catch { allQuestions = []; }
      } else { allQuestions = []; }
    }

    // Validate and normalize
    allQuestions = allQuestions.filter(q => q.question && q.option_a && q.option_b && q.option_c && q.option_d).map(q => ({
      question: String(q.question).trim(),
      option_a: String(q.option_a).trim(),
      option_b: String(q.option_b).trim(),
      option_c: String(q.option_c).trim(),
      option_d: String(q.option_d).trim(),
      correct_answer: String(q.correct_answer || 'a').toLowerCase().trim().charAt(0),
    }));

    if (!allQuestions.length) {
      return res.status(422).json({ error: 'AI could not generate questions. Try again or adjust the settings.' });
    }

    // If preview only, return questions without saving
    if (preview_only) {
      return res.json({
        questions: allQuestions,
        message: `AI generated ${allQuestions.length} questions for ${grade_level} ${subject}.`,
      });
    }

    // Save as a real quiz
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const quizResult = await client.query(
        'INSERT INTO quizzes (class_id, title, description, grade_level, subject) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [classId, title.trim(), description || null, grade_level.trim(), subject.trim()]
      );
      const quiz = quizResult.rows[0];

      for (let i = 0; i < allQuestions.length; i++) {
        const q = allQuestions[i];
        await client.query(
          `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, order_num)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [quiz.id, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, 'multiple_choice', i]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({
        quiz,
        questions: allQuestions,
        message: `Generated ${allQuestions.length} questions for ${grade_level} ${subject}.`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[AI Quiz Auto-Gen]', err);
    if (err.message === 'RATE_LIMITED' || err.status === 429) {
      return res.status(429).json({ error: 'AI is busy. Please wait 1 minute and try again.' });
    }
    res.status(500).json({ error: err.message || 'Failed to auto-generate quiz.' });
  }
});
