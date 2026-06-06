const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { notifyParentsOfStudent } = require('../lib/parentClassNotify');
const { notifyClassAudiencePush } = require('../lib/classContentNotify');
const { canTakeQuiz } = require('../lib/quizAccess');
const {
  ensureQuizShareSchema,
  newShareToken,
  sharePageUrl,
} = require('../lib/quizShares');
const { ensureQuizTeacherShareSchema } = require('../lib/quizTeacherShares');

const router = express.Router();

async function listQuizzesForClass(classId) {
  await ensureQuizShareSchema();
  await ensureQuizTeacherShareSchema();
  const native = await pool.query(
    `SELECT q.*, COUNT(qa.id)::int AS attempt_count,
            FALSE AS is_shared,
            NULL::text AS shared_from_teacher_name,
            NULL::text AS shared_from_class_name,
            NULL::text AS shared_from_class_subject,
            NULL::int AS shared_from_teacher_id,
            FALSE AS shared_from_teacher_verified,
            NULL::int AS teacher_share_id
     FROM quizzes q
     LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND COALESCE(qa.is_guest, FALSE) = FALSE
     WHERE q.class_id = $1
     GROUP BY q.id`,
    [classId]
  );
  const shared = await pool.query(
    `SELECT q.*, COUNT(qa.id)::int AS attempt_count,
            TRUE AS is_shared,
            st.name AS shared_from_teacher_name,
            sc.name AS shared_from_class_name,
            sc.subject AS shared_from_class_subject,
            st.id AS shared_from_teacher_id,
            (st.is_approved = TRUE AND st.school_id IS NOT NULL) AS shared_from_teacher_verified,
            ts.id AS teacher_share_id
     FROM quiz_teacher_shares ts
     JOIN quizzes q ON q.id = ts.source_quiz_id
     JOIN users st ON st.id = ts.source_teacher_id
     JOIN classes sc ON sc.id = ts.source_class_id
     LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND COALESCE(qa.is_guest, FALSE) = FALSE
     WHERE ts.target_class_id = $1 AND ts.status = 'accepted'
     GROUP BY q.id, st.name, sc.name, sc.subject, st.id, st.is_approved, st.school_id, ts.id`,
    [classId]
  );
  const merged = [...native.rows, ...shared.rows];
  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return merged;
}

// Auto-migrate new columns
pool.query(`
  ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'multiple_choice';
  ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS passage TEXT;
`).catch(e => console.error('[quizzes] migration error:', e.message));

// GET quizzes for a class (includes colleague shares accepted into this class)
router.get('/:classId/quizzes', authenticateToken, async (req, res) => {
  try {
    let rows = await listQuizzesForClass(req.params.classId);
    if (req.user.role === 'student') {
      rows = rows.map((q) => ({ ...q, is_group_quiz: false }));
    } else if (req.user.role === 'teacher' || req.user.role === 'head_teacher') {
      const classId = parseInt(req.params.classId, 10);
      const { annotateTeacherQuizzes } = require('../lib/quizSoloRelease');
      rows = await annotateTeacherQuizzes(classId, rows);
    }
    res.json(rows);
  } catch (err) {
    console.error('[quizzes/list]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET single quiz metadata (attribution for shared quizzes)
router.get('/:classId/quizzes/:quizId', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const quizId = parseInt(req.params.quizId, 10);
    const rows = await listQuizzesForClass(classId);
    const quiz = rows.find((q) => Number(q.id) === quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create quiz with questions (teacher)
router.post('/:classId/quizzes', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { title, description, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Title and at least one question are required.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quizResult = await client.query(
      'INSERT INTO quizzes (class_id, title, description) VALUES ($1,$2,$3) RETURNING *',
      [req.params.classId, title, description || null]
    );
    const quiz = quizResult.rows[0];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [quiz.id, q.question, q.option_a||null, q.option_b||null, q.option_c||null, q.option_d||null,
         (q.correct_answer||'a').toLowerCase(), q.question_type||'multiple_choice', q.passage||null, i]
      );
    }
    await client.query('COMMIT');
    notifyClassAudiencePush({
      classId: req.params.classId,
      excludeUserId: req.user.id,
      title: '📝 New quiz',
      body: `"${title}" is available in your class.`,
      contentType: 'quiz',
      tag: `quiz-${quiz.id}`,
    }).catch(() => {});
    res.status(201).json({ ...quiz, question_count: questions.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// POST release quiz to whole class (solo Quizzes tab) — for group-only quizzes
router.post(
  '/:classId/quizzes/:quizId/release-solo',
  authenticateToken,
  requireRole('teacher', 'head_teacher'),
  async (req, res) => {
    const classId = parseInt(req.params.classId, 10);
    const quizId = parseInt(req.params.quizId, 10);
    try {
      const { userCanManageClass } = require('../lib/classAccess');
      const manage = await userCanManageClass(req.user, classId);
      if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

      const quiz = await pool.query(
        'SELECT id, title FROM quizzes WHERE id = $1 AND class_id = $2',
        [quizId, classId]
      );
      if (!quiz.rows.length) return res.status(404).json({ error: 'Quiz not found in this class.' });

      const { releaseQuizToClassSolo } = require('../lib/quizSoloRelease');
      await releaseQuizToClassSolo(classId, quizId, req.user.id);

      notifyClassAudiencePush({
        classId,
        excludeUserId: req.user.id,
        title: '📝 Quiz available',
        body: `"${quiz.rows[0].title}" is on your class Quizzes tab.`,
        contentType: 'quiz',
        tag: `quiz-solo-${quizId}`,
      }).catch(() => {});

      res.json({ ok: true, quiz_id: quizId, solo_released: true });
    } catch (err) {
      console.error('[quizzes/release-solo]', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// GET quiz questions for teacher (includes correct_answer for editing)
router.get('/:classId/quizzes/:quizId/questions-edit', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT update quiz (teacher) — only allowed if no attempts exist
router.put('/:classId/quizzes/:quizId', authenticateToken, requireRole('teacher'), async (req, res) => {
  const { title, description, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Title and at least one question are required.' });
  }
  const client = await pool.connect();
  try {
    // Block edit if any student has already attempted this quiz
    const attemptCheck = await client.query(
      'SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = $1',
      [req.params.quizId]
    );
    if (parseInt(attemptCheck.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Cannot edit a quiz that students have already attempted.' });
    }
    await client.query('BEGIN');
    await client.query(
      'UPDATE quizzes SET title=$1, description=$2 WHERE id=$3 AND class_id=$4',
      [title, description || null, req.params.quizId, req.params.classId]
    );
    await client.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [req.params.quizId]);
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.params.quizId, q.question, q.option_a||null, q.option_b||null, q.option_c||null, q.option_d||null,
         (q.correct_answer||'a').toLowerCase(), q.question_type||'multiple_choice', q.passage||null, i]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Quiz updated.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// POST create public share link (teacher / HT)
router.post('/:classId/quizzes/:quizId/share', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const quizId = parseInt(req.params.quizId, 10);
  if (!classId || !quizId) return res.status(400).json({ error: 'Invalid quiz.' });
  try {
    await ensureQuizShareSchema();
    const q = await pool.query(
      'SELECT id FROM quizzes WHERE id = $1 AND class_id = $2 LIMIT 1',
      [quizId, classId]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Quiz not found.' });
    const token = newShareToken();
    await pool.query(
      `INSERT INTO quiz_shares (quiz_id, class_id, sharer_id, share_token)
       VALUES ($1,$2,$3,$4)`,
      [quizId, classId, req.user.id, token]
    );
    const shareUrl = sharePageUrl(token);
    res.status(201).json({
      share_url: shareUrl,
      share_token: token,
      preview: {
        title: 'UClass Quiz',
        description: 'Take this quiz on UClass — sign up as guest, student, or teacher.',
      },
    });
  } catch (err) {
    console.error('[quizzes/share]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET quiz questions (for taking quiz)
router.get('/:classId/quizzes/:quizId/questions', authenticateToken, async (req, res) => {
  try {
    const access = await canTakeQuiz(req.user, req.params.classId, req.params.quizId, {
      forQuestions: true,
    });
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const result = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST submit quiz answers (student or guest) - auto marks
router.post('/:classId/quizzes/:quizId/submit', authenticateToken, requireRole('student', 'guest'), async (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Answers are required.' });
  }
  const isGuest = req.user.role === 'guest';
  try {
    const access = await canTakeQuiz(req.user, req.params.classId, req.params.quizId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    // Block retake — one attempt per user per quiz
    const existing = await pool.query(
      'SELECT id FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2',
      [req.params.quizId, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'already_submitted' });
    }

    const questions = await pool.query(
      'SELECT id, correct_answer, question_type, passage FROM quiz_questions WHERE quiz_id = $1',
      [req.params.quizId]
    );
    let score = 0;
    const results = {};
    for (const q of questions.rows) {
      const given = String(answers[q.id] ?? '');
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
        } catch { isCorrect = false; }
      } else {
        isCorrect = given.toLowerCase() === (correct || '').toLowerCase();
      }
      if (isCorrect) score++;
      results[q.id] = { given, correct, isCorrect };
    }
    const total = questions.rows.length;
    await pool.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, score, total, answers, is_guest)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.quizId, req.user.id, score, total, JSON.stringify(answers), isGuest]
    );

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const earnedBadges = [];

    if (!isGuest) {
      try {
        const quizInfo = await pool.query(
          `SELECT q.title, q.class_id, c.teacher_id, t.school_id
           FROM quizzes q
           JOIN classes c ON c.id = q.class_id
           JOIN users t ON t.id = c.teacher_id
           WHERE q.id = $1`,
          [req.params.quizId]
        );
        const qi = quizInfo.rows[0];
        if (qi) {
          const st = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
          const studentName = st.rows[0]?.name || 'Student';
          await notifyParentsOfStudent({
            studentId: req.user.id,
            senderId: qi.teacher_id,
            type: 'quiz_result',
            title: `Your child completed a quiz`,
            body: `${studentName}: ${qi.title} — ${percentage}% (${score}/${total})`,
            payload: {
              class_id: qi.class_id,
              quiz_id: parseInt(req.params.quizId, 10),
              url: '/parent/dashboard?tab=child',
              student_id: req.user.id,
            },
          });
          const { notifyTeachersQuizSubmitted } = require('../lib/staffActivityNotify');
          await notifyTeachersQuizSubmitted({
            classId: qi.class_id,
            quizId: parseInt(req.params.quizId, 10),
            quizTitle: qi.title,
            studentName,
            score,
            total,
          });
        }
      } catch (e) {
        console.error('[quiz parent notify]', e.message);
      }

      const badgesToAward = [];
      if (percentage === 100) badgesToAward.push('perfect_score');
      if (percentage >= 90) badgesToAward.push('excellence');
      if (percentage >= 75) badgesToAward.push('great_job');
      if (score === 0) badgesToAward.push('keep_going');

      const topCheck = await pool.query(
        `SELECT qa.student_id FROM quiz_attempts qa
         JOIN users u ON u.id = qa.student_id AND u.role <> 'guest'
         WHERE qa.quiz_id=$1 AND COALESCE(qa.is_guest, FALSE) = FALSE
         ORDER BY qa.score DESC, qa.attempted_at ASC LIMIT 1`,
        [req.params.quizId]
      );
      if (topCheck.rows[0]?.student_id === req.user.id || topCheck.rows.length === 0) {
        badgesToAward.push('top_student');
      }

      for (const badge of badgesToAward) {
        try {
          await pool.query(
            `INSERT INTO student_badges (student_id, badge, quiz_id, class_id)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [req.user.id, badge, req.params.quizId, req.params.classId]
          );
          earnedBadges.push(badge);
        } catch (_) {}
      }
    }

    let newAchievements = [];
    if (!isGuest) {
      try {
        const { evaluateQuizSubmit } = require('../lib/achievementEngine');
        newAchievements = await evaluateQuizSubmit({
          studentId: req.user.id,
          classId: parseInt(req.params.classId, 10),
          groupId: null,
          quizId: parseInt(req.params.quizId, 10),
          score,
          total,
          questions: questions.rows,
        });
      } catch (e) {
        console.error('[achievements solo quiz]', e.message);
      }
    }

    res.json({ score, total, results, earnedBadges, newAchievements, guest: isGuest });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET student's own quiz result detail (for self-download)
router.get('/:classId/quizzes/:quizId/my-result', authenticateToken, requireRole('student', 'guest'), async (req, res) => {
  try {
    const access = await canTakeQuiz(req.user, req.params.classId, req.params.quizId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const attemptResult = await pool.query(
      `SELECT
         qa.*,
         u.name   AS student_name,
         qz.title AS quiz_title,
         c.name   AS class_name,
         c.subject AS class_subject,
         t.name   AS teacher_name,
         s.name   AS school_name,
         (SELECT COUNT(*)::int FROM quizzes q2
          WHERE q2.class_id = qz.class_id AND q2.created_at <= qz.created_at) AS quiz_number
       FROM quiz_attempts qa
       JOIN users u   ON u.id  = qa.student_id
       JOIN quizzes qz ON qz.id = qa.quiz_id
       JOIN classes c  ON c.id  = qz.class_id
       JOIN users t   ON t.id  = c.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id
       WHERE qa.quiz_id = $1 AND qa.student_id = $2
       ORDER BY qa.attempted_at DESC LIMIT 1`,
      [req.params.quizId, req.user.id]
    );
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: 'No attempt found.' });
    }
    const attempt = attemptResult.rows[0];
    const answers = attempt.answers || {};

    const questionsResult = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );

    const optionMap = { a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d' };
    const detailed = questionsResult.rows.map((q, idx) => {
      const studentAnswer = String(answers[String(q.id)] ?? '');
      const correctAnswer = q.correct_answer;
      const qtype = q.question_type || 'multiple_choice';
      let isCorrect = false;
      if (qtype === 'fill_blank') {
        isCorrect = studentAnswer.trim().toLowerCase() === (correctAnswer||'').trim().toLowerCase();
      } else if (qtype === 'matching') {
        try {
          const pairs = JSON.parse(q.passage || '[]');
          const parts = studentAnswer.split('|');
          isCorrect = pairs.length > 0 && pairs.every((p, i) =>
            (parts[i]||'').trim().toLowerCase() === p.right.trim().toLowerCase());
        } catch { isCorrect = false; }
      } else {
        isCorrect = studentAnswer.toLowerCase() === (correctAnswer||'').toLowerCase();
      }
      return {
        number: idx + 1,
        question: q.question,
        question_type: qtype,
        passage: q.passage,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        student_answer: studentAnswer || 'No answer',
        student_answer_text: qtype === 'fill_blank' || qtype === 'matching' ? (studentAnswer || 'No answer') :
          (studentAnswer ? (q[optionMap[studentAnswer]] || studentAnswer) : 'No answer'),
        correct_answer: correctAnswer,
        correct_answer_text: qtype === 'fill_blank' ? correctAnswer :
          qtype === 'matching' ? (q.passage || '') :
          (q[optionMap[correctAnswer]] || correctAnswer),
        is_correct: isCorrect,
      };
    });

    res.json({
      student_name: attempt.student_name,
      quiz_title: attempt.quiz_title,
      quiz_number: attempt.quiz_number,
      class_name: attempt.class_name,
      class_subject: attempt.class_subject,
      teacher_name: attempt.teacher_name,
      school_name: attempt.school_name || 'N/A',
      score: attempt.score,
      total: attempt.total,
      attempted_at: attempt.attempted_at,
      questions: detailed,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET quiz results for teacher / HT
router.get('/:classId/quizzes/:quizId/results', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qa.*, u.name AS student_name, u.role AS user_role,
              COALESCE(qa.is_guest, FALSE) AS is_guest,
              qz.title AS quiz_title
       FROM quiz_attempts qa
       JOIN users u ON qa.student_id = u.id
       JOIN quizzes qz ON qz.id = qa.quiz_id
       WHERE qa.quiz_id = $1 ORDER BY qa.is_guest ASC, qa.score DESC`,
      [req.params.quizId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET detailed attempt for teacher download (questions + student answers + correct answers)
router.get('/:classId/quizzes/:quizId/attempts/:attemptId/detail', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const attemptResult = await pool.query(
      `SELECT
         qa.*,
         u.name  AS student_name,
         qz.title AS quiz_title,
         c.name   AS class_name,
         c.subject AS class_subject,
         t.name   AS teacher_name,
         s.name   AS school_name,
         (SELECT COUNT(*)::int FROM quizzes q2
          WHERE q2.class_id = qz.class_id AND q2.created_at <= qz.created_at) AS quiz_number
       FROM quiz_attempts qa
       JOIN users u   ON u.id  = qa.student_id
       JOIN quizzes qz ON qz.id = qa.quiz_id
       JOIN classes c  ON c.id  = qz.class_id
       JOIN users t   ON t.id  = c.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id
       WHERE qa.id = $1 AND qa.quiz_id = $2`,
      [req.params.attemptId, req.params.quizId]
    );
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }
    const attempt = attemptResult.rows[0];
    const answers = attempt.answers || {};

    const questionsResult = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [req.params.quizId]
    );

    const optionMap = { a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d' };
    const detailed = questionsResult.rows.map((q, idx) => {
      const studentAnswer = (answers[String(q.id)] || '').toLowerCase();
      const correctAnswer = q.correct_answer;
      return {
        number: idx + 1,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        student_answer: studentAnswer || 'No answer',
        student_answer_text: studentAnswer ? (q[optionMap[studentAnswer]] || studentAnswer) : 'No answer',
        correct_answer: correctAnswer,
        correct_answer_text: q[optionMap[correctAnswer]],
        is_correct: studentAnswer === correctAnswer,
      };
    });

    res.json({
      student_name: attempt.student_name,
      quiz_title: attempt.quiz_title,
      quiz_number: attempt.quiz_number,
      class_name: attempt.class_name,
      class_subject: attempt.class_subject,
      teacher_name: attempt.teacher_name,
      school_name: attempt.school_name || 'N/A',
      score: attempt.score,
      total: attempt.total,
      attempted_at: attempt.attempted_at,
      questions: detailed,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE quiz (teacher)
router.delete('/:classId/quizzes/:quizId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM quizzes WHERE id = $1 AND class_id = $2', [req.params.quizId, req.params.classId]);
    res.json({ message: 'Quiz deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
