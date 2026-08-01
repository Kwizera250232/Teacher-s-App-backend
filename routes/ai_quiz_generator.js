const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');

const router = express.Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'gemma2-9b-it';
const SEARXNG_URL = 'http://localhost:8888';

/**
 * Split large text into chunks for processing.
 */
function chunkText(text, maxChars = 12000) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
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

/**
 * Call Groq API (OpenAI-compatible). Permanently free tier.
 * Returns the text content from the response.
 */
async function callGroq(messages, maxTokens = 8192, temperature = 0.4) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (res.status === 429) {
    const e = new Error('RATE_LIMITED');
    e.status = 429;
    throw e;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error('[Groq] error', res.status, errText.slice(0, 300));
    throw new Error(`Groq API error: ${res.status}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/**
 * Search the web using SearXNG (self-hosted, permanently free).
 * Returns array of { title, content, url }.
 */
async function searchWeb(query, numResults = 10) {
  try {
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general&pageno=1`;
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) {
      console.error('[SearXNG] error', res.status);
      return [];
    }
    const data = await res.json();
    return (data.results || []).slice(0, numResults).map(r => ({
      title: r.title || '',
      content: r.content || '',
      url: r.url || '',
    }));
  } catch (err) {
    console.error('[SearXNG] fetch error', err.message);
    return [];
  }
}

/**
 * Parse JSON questions from AI text response.
 */
function parseQuestionsFromText(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  let questions;
  try {
    questions = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        questions = JSON.parse(match[0]);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }
  return questions;
}

/**
 * Generate MCQ questions from a chunk of content using Groq AI (permanently free).
 * Returns array of question objects: { question, option_a, option_b, option_c, option_d, correct_answer }
 */
async function generateQuestionsFromChunk(chunk, chunkIndex, totalChunks, numQuestions, gradeLevel, subject) {
  const gradeDesc = gradeLevel ? `\nGRADE LEVEL: ${gradeLevel} (Rwandan education system). ${gradeLevel.startsWith('P') ? 'Primary school level — use simple, age-appropriate language and concepts matching the Rwandan curriculum for ' + gradeLevel + '.' : 'Secondary school level — use appropriate depth and complexity matching the Rwandan curriculum for ' + gradeLevel + '.'}` : '';
  const subjectDesc = subject ? `\nSUBJECT: ${subject}. Generate questions strictly related to this subject following the Rwandan national curriculum for ${gradeLevel || 'the selected grade'}.` : '';

  const systemPrompt = `You are an expert exam creator for the Rwandan education system. Create multiple choice questions (MCQ) from educational content.${gradeDesc}${subjectDesc}

IMPORTANT RULES:
1. Create exactly ${numQuestions} multiple choice questions from this content.
2. Each question must have exactly 4 options labeled A, B, C, D.
3. The correct answer must be one of A, B, C, or D.
4. Questions should be clear, accurate, and test understanding of the content.
5. Distractors (wrong options) should be plausible but clearly incorrect.
6. If the content already contains questions, convert them into MCQ format with 4 options.
7. Adapt the difficulty and language to match ${gradeLevel || 'the selected'} level in the Rwandan curriculum.

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

  const userPrompt = `CONTENT (Part ${chunkIndex + 1} of ${totalChunks}):\n"""\n${chunk}\n"""`;

  const text = await callGroq([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const questions = parseQuestionsFromText(text);
  if (!questions.length) {
    console.error('[AI Quiz Gen] No questions parsed from Groq response', text.slice(0, 300));
    return [];
  }

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
 * Generate MCQ questions from web search results using Groq AI.
 * Combines SearXNG search results + Groq question generation.
 */
async function generateQuestionsFromWebSearch(subject, gradeLevel, year, numQuestions) {
  const searchQuery = year
    ? `Rwanda ${gradeLevel} ${subject} national exam past paper ${year} questions answers`
    : `Rwanda ${gradeLevel} ${subject} national exam past paper questions answers`;

  console.log(`[AI Quiz] Searching web: ${searchQuery}`);
  const searchResults = await searchWeb(searchQuery, 5);

  if (!searchResults.length) {
    console.log('[AI Quiz] No search results found');
    return { questions: [], source: 'web-search (no results)' };
  }

  // Combine search result snippets — truncate to keep under Groq's 15K TPM limit
  const searchContext = searchResults
    .map((r, i) => `[${i + 1}] ${r.title.slice(0, 80)}\n${r.content.slice(0, 200)}`)
    .join('\n');

  const gradeDesc = gradeLevel ? `\nGRADE LEVEL: ${gradeLevel} (Rwandan education system).` : '';
  const subjectDesc = subject ? `\nSUBJECT: ${subject}.` : '';

  const systemPrompt = `You are an exam creator for Rwanda. Create ${numQuestions} MCQs from these search results about ${subject} for ${gradeLevel}. Each has 4 options (A-D) and one correct answer. Respond ONLY with JSON array: [{"question":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"a"}]`;

  const userPrompt = `Search results:\n${searchContext}`;

  const text = await callGroq([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const questions = parseQuestionsFromText(text);
  if (!questions.length) {
    console.error('[AI Quiz] No questions parsed from Groq web search response', text.slice(0, 300));
    return { questions: [], source: 'web-search (AI parse failed)' };
  }

  const valid = questions.filter(q => q.question && q.option_a && q.option_b && q.option_c && q.option_d).map(q => ({
    question: String(q.question).trim(),
    option_a: String(q.option_a).trim(),
    option_b: String(q.option_b).trim(),
    option_c: String(q.option_c).trim(),
    option_d: String(q.option_d).trim(),
    correct_answer: String(q.correct_answer || 'a').toLowerCase().trim().charAt(0),
  }));

  return { questions: valid, source: `web search + AI (${searchResults.length} results)` };
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured. Set GROQ_API_KEY.' });

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

  const apiKey = process.env.GROQ_API_KEY;
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

// ════════════════════════════════════════════════════════════════════════════
// AI-POWERED QUIZ GENERATOR (SearXNG web search + Groq AI — permanently free)
// Flow: web search → Groq AI generates questions → database fallback
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate questions from textbook content using simple NLP-free extraction.
 * Finds key sentences and creates fill-in-the-blank MCQs.
 */
function generateQuestionsFromText(text, subject, gradeLevel, maxQuestions) {
  if (!text || text.length < 100) return [];

  // Split into sentences
  const sentences = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '. ')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 300);

  const questions = [];
  const usedAnswers = new Set();

  for (const sentence of sentences) {
    if (questions.length >= maxQuestions) break;

    // Strategy 1: Find sentences with definitions (X is/are Y)
    const defMatch = sentence.match(/^(.{5,60}?)\s+(?:is|are|was|were|means|refers to)\s+(.{5,120}?)\.?$/i);
    if (defMatch) {
      const term = defMatch[1].trim();
      const definition = defMatch[2].trim();
      if (term.split(' ').length <= 6 && definition.split(' ').length <= 15 && !usedAnswers.has(definition.toLowerCase())) {
        usedAnswers.add(definition.toLowerCase());
        // Find 3 distractors from other sentences
        const distractors = [];
        for (const other of sentences) {
          if (distractors.length >= 3) break;
          if (other === sentence) continue;
          const otherDef = other.match(/(?:is|are|was|were|means|refers to)\s+(.{5,60}?)\.?$/i);
          if (otherDef) {
            const d = otherDef[1].trim();
            if (d.toLowerCase() !== definition.toLowerCase() && !distractors.includes(d)) {
              distractors.push(d);
            }
          }
        }
        if (distractors.length >= 3) {
          const options = [definition, ...distractors.slice(0, 3)];
          // Shuffle
          for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
          }
          const correctIdx = options.indexOf(definition);
          const letters = ['a', 'b', 'c', 'd'];
          questions.push({
            question: `What ${defMatch[0].match(/is|are|was|were/i)[0]} "${term}"?`,
            option_a: options[0],
            option_b: options[1],
            option_c: options[2],
            option_d: options[3],
            correct_answer: letters[correctIdx],
          });
          continue;
        }
      }
    }

    // Strategy 2: Find sentences with numbers/years (fill-in-the-blank)
    const numMatch = sentence.match(/^(.{20,150}?)\s+(\d+(?:[\.,]\d+)?)\s+(.{10,80}?)\.?$/);
    if (numMatch) {
      const before = numMatch[1].trim();
      const number = numMatch[2];
      const after = numMatch[3].trim();
      if (!usedAnswers.has(number)) {
        usedAnswers.add(number);
        // Generate distractors by modifying the number
        const num = parseFloat(number.replace(',', ''));
        const distractors = new Set();
        while (distractors.size < 3) {
          const variant = num + Math.floor(Math.random() * 20) - 10;
          if (variant !== num && variant > 0) {
            distractors.add(String(variant));
          }
        }
        const options = [number, ...Array.from(distractors)];
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }
        const correctIdx = options.indexOf(number);
        const letters = ['a', 'b', 'c', 'd'];
        questions.push({
          question: `Fill in the blank: ${before} ____ ${after}`,
          option_a: options[0],
          option_b: options[1],
          option_c: options[2],
          option_d: options[3],
          correct_answer: letters[correctIdx],
        });
        continue;
      }
    }

    // Strategy 3: Key term cloze — remove a capitalized word from a sentence
    const words = sentence.split(/\s+/);
    const capWordIdx = words.findIndex((w, i) => i > 0 && i < words.length - 1 && /^[A-Z][a-z]{3,15}$/.test(w) && !['The', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What', 'Which', 'How', 'Why', 'There', 'Then', 'However', 'Also', 'Some', 'Many', 'Such', 'Each', 'Other', 'Another', 'Both'].includes(w));
    if (capWordIdx >= 0) {
      const keyWord = words[capWordIdx].replace(/[.,;:!?]$/, '');
      if (!usedAnswers.has(keyWord.toLowerCase())) {
        usedAnswers.add(keyWord.toLowerCase());
        // Find 3 distractors — other capitalized words from other sentences
        const distractors = new Set();
        for (const other of sentences) {
          if (distractors.size >= 3) break;
          if (other === sentence) continue;
          const otherWords = other.split(/\s+/);
          for (const ow of otherWords) {
            const clean = ow.replace(/[.,;:!?]$/, '');
            if (/^[A-Z][a-z]{3,15}$/.test(clean) && clean !== keyWord && !['The', 'This', 'That', 'These', 'Those'].includes(clean)) {
              distractors.add(clean);
            }
            if (distractors.size >= 3) break;
          }
        }
        if (distractors.size >= 3) {
          const blankSentence = words.map((w, i) => i === capWordIdx ? '____' : w).join(' ');
          const options = [keyWord, ...Array.from(distractors).slice(0, 3)];
          for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
          }
          const correctIdx = options.indexOf(keyWord);
          const letters = ['a', 'b', 'c', 'd'];
          questions.push({
            question: `Fill in the blank: ${blankSentence}`,
            option_a: options[0],
            option_b: options[1],
            option_c: options[2],
            option_d: options[3],
            correct_answer: letters[correctIdx],
          });
        }
      }
    }
  }

  return questions;
}

/**
 * POST /api/classes/:classId/ai-quiz/auto-generate
 * Body: { title, description?, grade_level, subject, num_questions?, year?, preview_only? }
 * Generates quiz from: web search + Groq AI → past papers → existing quizzes → textbooks.
 */
router.post('/:classId/ai-quiz/auto-generate', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  const { title, description, grade_level, subject, num_questions, year, preview_only } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Quiz title is required.' });
  if (!grade_level || !grade_level.trim()) return res.status(400).json({ error: 'Grade level is required.' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required.' });

  const totalQuestions = Math.min(50, Math.max(5, parseInt(num_questions, 10) || 20));
  const sources = [];

  try {
    let allQuestions = [];

    // ── SOURCE 1: Web Search + Groq AI (primary — searches Google for past papers) ──
    try {
      const webResult = await generateQuestionsFromWebSearch(subject, grade_level, year, totalQuestions);
      if (webResult.questions.length > 0) {
        sources.push(webResult.source);
        allQuestions.push(...webResult.questions);
        console.log(`[AI Quiz] Web search + Groq generated ${webResult.questions.length} questions`);
      }
    } catch (err) {
      if (err.message === 'RATE_LIMITED' || err.status === 429) {
        return res.status(429).json({ error: 'AI is busy. Please wait a moment and try again.' });
      }
      console.error('[AI Quiz] Web search + Groq failed, falling back to database:', err.message);
    }

    // ── SOURCE 2: Past Paper Questions (real national exam questions from database) ──
    if (allQuestions.length < totalQuestions) {
    let pastPaperQuery, pastPaperParams;
    if (year) {
      pastPaperQuery = `
        SELECT pp.question, pp.option_a, pp.option_b, pp.option_c, pp.option_d, pp.correct_answer,
               e.title as exam_title, e.year, e.subject, e.class_level
        FROM past_paper_questions pp
        JOIN past_paper_exams e ON e.id = pp.exam_id
        WHERE e.subject ILIKE $1 AND e.year = $2
        ORDER BY RANDOM()`;
      pastPaperParams = [`%${subject}%`, parseInt(year)];
    } else {
      pastPaperQuery = `
        SELECT pp.question, pp.option_a, pp.option_b, pp.option_c, pp.option_d, pp.correct_answer,
               e.title as exam_title, e.year, e.subject, e.class_level
        FROM past_paper_questions pp
        JOIN past_paper_exams e ON e.id = pp.exam_id
        WHERE e.subject ILIKE $1
        ORDER BY RANDOM()`;
      pastPaperParams = [`%${subject}%`];
    }

    const pastPaperResult = await pool.query(pastPaperQuery, pastPaperParams);
    if (pastPaperResult.rows.length > 0) {
      sources.push(`${pastPaperResult.rows.length} from past papers (${pastPaperResult.rows[0].exam_title})`);
      allQuestions.push(...pastPaperResult.rows.map(q => ({
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c || '',
        option_d: q.option_d || '',
        correct_answer: q.correct_answer,
      })));
    }

    }

    // ── SOURCE 3: Existing Quiz Questions (from all classes with matching subject) ──
    if (allQuestions.length < totalQuestions) {
      const matchingClasses = await pool.query(
        `SELECT id FROM classes WHERE subject ILIKE $1 OR name ILIKE $1`,
        [`%${subject}%`]
      );
      const classIds = matchingClasses.rows.map(c => c.id);

      if (classIds.length > 0) {
        const quizQuestions = await pool.query(
          `SELECT qq.question, qq.option_a, qq.option_b, qq.option_c, qq.option_d, qq.correct_answer,
                  q.title as quiz_title
           FROM quiz_questions qq
           JOIN quizzes q ON q.id = qq.quiz_id
           WHERE q.class_id = ANY($1::int[])
           ORDER BY RANDOM()
           LIMIT $2`,
          [classIds, totalQuestions * 2]
        );
        if (quizQuestions.rows.length > 0) {
          sources.push(`${quizQuestions.rows.length} from existing quizzes`);
          allQuestions.push(...quizQuestions.rows.map(q => ({
            question: q.question,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c || '',
            option_d: q.option_d || '',
            correct_answer: q.correct_answer,
          })));
        }
      }

      // Fallback: search ALL quizzes if subject-specific search found nothing
      if (allQuestions.length === 0) {
        const allQuizQuestions = await pool.query(
          `SELECT qq.question, qq.option_a, qq.option_b, qq.option_c, qq.option_d, qq.correct_answer
           FROM quiz_questions qq
           JOIN quizzes q ON q.id = qq.quiz_id
           ORDER BY RANDOM()
           LIMIT $1`,
          [totalQuestions * 2]
        );
        if (allQuizQuestions.rows.length > 0) {
          sources.push(`${allQuizQuestions.rows.length} from all quizzes (fallback)`);
          allQuestions.push(...allQuizQuestions.rows.map(q => ({
            question: q.question,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c || '',
            option_d: q.option_d || '',
            correct_answer: q.correct_answer,
          })));
        }
      }
    }

    // ── SOURCE 4: Textbook content (generate questions from extracted text) ──
    if (allQuestions.length < totalQuestions) {
      const needed = totalQuestions - allQuestions.length;
      const textbooks = await pool.query(
        `SELECT title, content FROM textbooks
         WHERE subject ILIKE $1 AND grade_level ILIKE $2 AND content IS NOT NULL AND content <> ''
         ORDER BY book_type DESC, id ASC`,
        [`%${subject}%`, `%${grade_level}%`]
      );

      // Fallback: any textbook with matching grade
      let bookResults = textbooks;
      if (textbooks.rows.length === 0) {
        bookResults = await pool.query(
          `SELECT title, content FROM textbooks
           WHERE grade_level ILIKE $1 AND content IS NOT NULL AND content <> ''
           ORDER BY subject, id ASC`,
          [`%${grade_level}%`]
        );
      }

      // Fallback: any textbook at all
      if (bookResults.rows.length === 0) {
        bookResults = await pool.query(
          `SELECT title, content FROM textbooks
           WHERE content IS NOT NULL AND content <> ''
           ORDER BY RANDOM() LIMIT 3`
        );
      }

      if (bookResults.rows.length > 0) {
        const textQuestions = [];
        for (const book of bookResults.rows) {
          if (textQuestions.length >= needed) break;
          const generated = generateQuestionsFromText(
            book.content,
            subject,
            grade_level,
            needed - textQuestions.length
          );
          textQuestions.push(...generated);
        }
        if (textQuestions.length > 0) {
          sources.push(`${textQuestions.length} generated from textbooks`);
          allQuestions.push(...textQuestions);
        }
      }
    }

    // ── Deduplicate by question text ────────────────────────────────────────
    const seen = new Set();
    allQuestions = allQuestions.filter(q => {
      const key = q.question.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Shuffle and limit ───────────────────────────────────────────────────
    allQuestions = allQuestions.sort(() => Math.random() - 0.5).slice(0, totalQuestions);

    // ── Validate and normalize ──────────────────────────────────────────────
    allQuestions = allQuestions.filter(q => q.question && q.option_a && q.option_b).map(q => ({
      question: String(q.question).trim(),
      option_a: String(q.option_a).trim(),
      option_b: String(q.option_b).trim(),
      option_c: String(q.option_c || '').trim() || '—',
      option_d: String(q.option_d || '').trim() || '—',
      correct_answer: String(q.correct_answer || 'a').toLowerCase().trim().charAt(0),
    }));

    if (!allQuestions.length) {
      return res.status(404).json({
        error: `No questions found for ${subject} at ${grade_level} level. Try a different subject or year.`,
      });
    }

    const sourceMsg = sources.length > 0 ? sources.join(', ') : 'database';

    // ── If preview only, return without saving ──────────────────────────────
    if (preview_only) {
      return res.json({
        questions: allQuestions,
        message: `Found ${allQuestions.length} questions for ${grade_level} ${subject} (from: ${sourceMsg}).`,
      });
    }

    // ── Save as a real quiz ─────────────────────────────────────────────────
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
        message: `Generated ${allQuestions.length} questions for ${grade_level} ${subject} (from: ${sourceMsg}).`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[AI Quiz Auto-Gen]', err);
    res.status(500).json({ error: err.message || 'Failed to generate quiz.' });
  }
});

module.exports = router;
