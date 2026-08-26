// routes/coaching.js — Live Coaching Session routes
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass, userCanAccessClass } = require('../lib/classAccess');
const { ensureCoachingTables } = require('../lib/coachingSchema');
const { insertUserNotification } = require('../lib/classMomentNotify');

const router = express.Router();
ensureCoachingTables();

// GET /coaching-sessions — list sessions for a class
router.get('/:classId/coaching-sessions', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

    const sessions = await pool.query(
      `SELECT cs.*, u.name AS teacher_name, c.name AS class_name,
              q.title AS quiz_title,
              (SELECT COUNT(*) FROM coaching_session_participants WHERE session_id = cs.id AND joined_at IS NOT NULL) AS participant_count
       FROM coaching_sessions cs
       JOIN users u ON u.id = cs.teacher_id
       JOIN classes c ON c.id = cs.class_id
       LEFT JOIN quizzes q ON q.id = cs.quiz_id
       WHERE cs.class_id = $1
       ORDER BY cs.created_at DESC`,
      [classId]
    );

    // For students, also check if they're invited
    if (req.user.role === 'student') {
      const invited = await pool.query(
        `SELECT session_id FROM coaching_session_participants WHERE student_id = $1 AND session_id = ANY($2)`,
        [req.user.id, sessions.rows.map(s => s.id)]
      );
      const invitedSet = new Set(invited.rows.map(r => r.session_id));
      sessions.rows.forEach(s => { s.is_invited = invitedSet.has(s.id); });
    }

    res.json(sessions.rows);
  } catch (err) {
    console.error('[coaching] list error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /coaching-sessions — create a new session
router.post('/:classId/coaching-sessions', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const { title, topic, description, scheduled_at, quiz_id, invited_student_ids, count_toward_official } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not manage this class.' });

    const result = await pool.query(
      `INSERT INTO coaching_sessions (class_id, teacher_id, title, topic, description, scheduled_at, quiz_id, count_toward_official, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
       RETURNING *`,
      [classId, req.user.id, title.trim(), topic || null, description || null, scheduled_at || null, quiz_id || null, count_toward_official || false]
    );
    const session = result.rows[0];

    // Invite students (or whole class if none specified)
    let studentIds = invited_student_ids;
    if (!studentIds || studentIds.length === 0) {
      const allStudents = await pool.query(
        `SELECT u.id FROM class_members cm JOIN users u ON u.id = cm.student_id WHERE cm.class_id = $1 AND u.role = 'student'`,
        [classId]
      );
      studentIds = allStudents.rows.map(r => r.id);
    }

    for (const sid of studentIds) {
      await pool.query(
        `INSERT INTO coaching_session_participants (session_id, student_id, is_invited) VALUES ($1, $2, TRUE)
         ON CONFLICT (session_id, student_id) DO NOTHING`,
        [session.id, sid]
      );
      // Send notification
      try {
        await insertUserNotification({
          userId: sid,
          type: 'coaching_invite',
          title: 'Live Coaching Session Invitation',
          body: `You are invited to "${session.title}" coaching session. Open the app to join.`,
          payload: { session_id: session.id, class_id: classId },
        });
      } catch (e) { /* notification non-critical */ }
    }

    res.json({ ...session, invited_count: studentIds.length });
  } catch (err) {
    console.error('[coaching] create error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /coaching-sessions/:sessionId — get session detail
router.get('/:classId/coaching-sessions/:sessionId', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

    const sessionRes = await pool.query(
      `SELECT cs.*, u.name AS teacher_name, q.title AS quiz_title
       FROM coaching_sessions cs
       JOIN users u ON u.id = cs.teacher_id
       LEFT JOIN quizzes q ON q.id = cs.quiz_id
       WHERE cs.id = $1 AND cs.class_id = $2`,
      [sessionId, classId]
    );
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    const session = sessionRes.rows[0];

    // Get participants with join status
    const participants = await pool.query(
      `SELECT csp.student_id, u.name, u.email, csp.joined_at, csp.left_at, csp.is_invited,
              p.avatar_path
       FROM coaching_session_participants csp
       JOIN users u ON u.id = csp.student_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE csp.session_id = $1
       ORDER BY u.name`,
      [sessionId]
    );
    session.participants = participants.rows;

    // Get questions if quiz is linked
    if (session.quiz_id) {
      const questions = await pool.query(
        `SELECT id, question, option_a, option_b, option_c, option_d, question_type, passage, order_num
         FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num, id`,
        [session.quiz_id]
      );
      session.questions = questions.rows;
    }

    res.json(session);
  } catch (err) {
    console.error('[coaching] detail error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /coaching-sessions/:sessionId — update session (start, finish, etc.)
router.put('/:classId/coaching-sessions/:sessionId', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  const { status, title, topic, description, scheduled_at, count_toward_official } = req.body;
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not manage this class.' });

    const existing = await pool.query('SELECT * FROM coaching_sessions WHERE id = $1 AND class_id = $2', [sessionId, classId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });

    const updates = [];
    const values = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
    if (topic !== undefined) { updates.push(`topic = $${idx++}`); values.push(topic); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (scheduled_at !== undefined) { updates.push(`scheduled_at = $${idx++}`); values.push(scheduled_at); }
    if (count_toward_official !== undefined) { updates.push(`count_toward_official = $${idx++}`); values.push(count_toward_official); }

    if (status === 'live' && !existing.rows[0].started_at) {
      updates.push(`started_at = $${idx++}`);
      values.push(new Date().toISOString());
    }
    if (status === 'completed') {
      updates.push(`ended_at = $${idx++}`);
      values.push(new Date().toISOString());
    }

    values.push(sessionId, classId);
    const result = await pool.query(
      `UPDATE coaching_sessions SET ${updates.join(', ')} WHERE id = $${idx++} AND class_id = $${idx++} RETURNING *`,
      values
    );

    // Notify students when session starts
    if (status === 'live') {
      const participants = await pool.query(
        `SELECT student_id FROM coaching_session_participants WHERE session_id = $1 AND is_invited = TRUE`,
        [sessionId]
      );
      for (const p of participants.rows) {
        try {
          await insertUserNotification({
            userId: p.student_id,
            type: 'coaching_live',
            title: 'Live Coaching Session Started!',
            body: `"${existing.rows[0].title}" is now live. Join now!`,
            payload: { session_id: sessionId, class_id: classId },
          });
        } catch (e) { /* non-critical */ }
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[coaching] update error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /coaching-sessions/:sessionId/join — student joins session
router.post('/:classId/coaching-sessions/:sessionId/join', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

    // Check if invited or class member
    const invited = await pool.query(
      `SELECT 1 FROM coaching_session_participants WHERE session_id = $1 AND student_id = $2`,
      [sessionId, req.user.id]
    );
    if (invited.rows.length === 0) {
      // Auto-add if class member
      const isMember = await pool.query(
        `SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2`,
        [classId, req.user.id]
      );
      if (!isMember.rows.length) return res.status(403).json({ error: 'Not invited to this session.' });
      await pool.query(
        `INSERT INTO coaching_session_participants (session_id, student_id, is_invited) VALUES ($1, $2, TRUE)
         ON CONFLICT DO NOTHING`,
        [sessionId, req.user.id]
      );
    }

    await pool.query(
      `UPDATE coaching_session_participants SET joined_at = NOW(), left_at = NULL WHERE session_id = $1 AND student_id = $2`,
      [sessionId, req.user.id]
    );

    res.json({ joined: true });
  } catch (err) {
    console.error('[coaching] join error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /coaching-sessions/:sessionId/leave — student leaves
router.post('/:classId/coaching-sessions/:sessionId/leave', authenticateToken, requireRole('student'), async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    await pool.query(
      `UPDATE coaching_session_participants SET left_at = NOW() WHERE session_id = $1 AND student_id = $2`,
      [sessionId, req.user.id]
    );
    res.json({ left: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /coaching-sessions/:sessionId/state — get live state (polled by students)
router.get('/:classId/coaching-sessions/:sessionId/state', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

    const state = await pool.query(
      `SELECT status, current_question_index, show_answer, is_paused, question_group_size,
              pen_holder_id, whiteboard_data, started_at,
              hand_raised, speak_permission_id, answer_timer_seconds, answer_timer_started_at,
              show_exercises
       FROM coaching_sessions WHERE id = $1 AND class_id = $2`,
      [sessionId, classId]
    );
    if (state.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });

    // Get current participants (joined, not left)
    const participants = await pool.query(
      `SELECT csp.student_id, u.name, p.avatar_path
       FROM coaching_session_participants csp
       JOIN users u ON u.id = csp.student_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE csp.session_id = $1 AND csp.joined_at IS NOT NULL AND csp.left_at IS NULL`,
      [sessionId]
    );

    // Get current question if quiz linked
    const session = state.rows[0];
    let currentQuestion = null;
    if (session.current_question_index >= 0) {
      const quizId = await pool.query('SELECT quiz_id FROM coaching_sessions WHERE id = $1', [sessionId]);
      if (quizId.rows[0]?.quiz_id) {
        const questions = await pool.query(
          `SELECT id, question, option_a, option_b, option_c, option_d, question_type, passage, order_num
           FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num, id`,
          [quizId.rows[0].quiz_id]
        );
        if (session.current_question_index < questions.rows.length) {
          currentQuestion = questions.rows[session.current_question_index];
          // Include answer if show_answer is true
          if (session.show_answer) {
            const fullQ = await pool.query('SELECT correct_answer FROM quiz_questions WHERE id = $1', [currentQuestion.id]);
            currentQuestion.correct_answer = fullQ.rows[0]?.correct_answer;
          }
        }
        session.total_questions = questions.rows.length;
      }
    }

    // Get student's previous answer for current question
    if (req.user.role === 'student' && currentQuestion) {
      const myAnswer = await pool.query(
        `SELECT answer, is_correct, awarded_marks, requires_review FROM coaching_session_answers
         WHERE session_id = $1 AND student_id = $2 AND question_id = $3`,
        [sessionId, req.user.id, currentQuestion.id]
      );
      session.my_answer = myAnswer.rows[0] || null;
    }

    // Get pen holder name
    if (session.pen_holder_id) {
      const penHolder = await pool.query('SELECT name FROM users WHERE id = $1', [session.pen_holder_id]);
      session.pen_holder_name = penHolder.rows[0]?.name;
    }

    session.participants = participants.rows;
    session.current_question = currentQuestion;

    res.json(state.rows[0]);
  } catch (err) {
    console.error('[coaching] state error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /coaching-sessions/:sessionId/state — teacher updates live state
router.put('/:classId/coaching-sessions/:sessionId/state', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  const { current_question_index, show_answer, is_paused, question_group_size, pen_holder_id, whiteboard_data,
          hand_raised, speak_permission_id, answer_timer_seconds, answer_timer_started_at, show_exercises } = req.body;
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not manage this class.' });

    const updates = [];
    const values = [];
    let idx = 1;

    if (current_question_index !== undefined) { updates.push(`current_question_index = $${idx++}`); values.push(current_question_index); }
    if (show_answer !== undefined) { updates.push(`show_answer = $${idx++}`); values.push(show_answer); }
    if (is_paused !== undefined) { updates.push(`is_paused = $${idx++}`); values.push(is_paused); }
    if (question_group_size !== undefined) { updates.push(`question_group_size = $${idx++}`); values.push(question_group_size); }
    if (pen_holder_id !== undefined) { updates.push(`pen_holder_id = $${idx++}`); values.push(pen_holder_id); }
    if (whiteboard_data !== undefined) { updates.push(`whiteboard_data = $${idx++}`); values.push(whiteboard_data); }
    if (hand_raised !== undefined) { updates.push(`hand_raised = $${idx++}`); values.push(hand_raised ? JSON.stringify(hand_raised) : null); }
    if (speak_permission_id !== undefined) { updates.push(`speak_permission_id = $${idx++}`); values.push(speak_permission_id); }
    if (answer_timer_seconds !== undefined) { updates.push(`answer_timer_seconds = $${idx++}`); values.push(answer_timer_seconds); }
    if (answer_timer_started_at !== undefined) { updates.push(`answer_timer_started_at = $${idx++}`); values.push(answer_timer_started_at); }
    if (show_exercises !== undefined) { updates.push(`show_exercises = $${idx++}`); values.push(show_exercises); }

    if (updates.length === 0) return res.json({ updated: false });

    values.push(sessionId, classId);
    const result = await pool.query(
      `UPDATE coaching_sessions SET ${updates.join(', ')} WHERE id = $${idx++} AND class_id = $${idx++} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[coaching] state update error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /coaching-sessions/:sessionId/answer — student submits answer for current question
router.post('/:classId/coaching-sessions/:sessionId/answer', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  const { question_id, answer } = req.body;
  if (!question_id || answer === undefined) return res.status(400).json({ error: 'Question ID and answer required.' });
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

    // Get question to check answer
    const qRes = await pool.query('SELECT * FROM quiz_questions WHERE id = $1', [question_id]);
    if (qRes.rows.length === 0) return res.status(404).json({ error: 'Question not found.' });
    const q = qRes.rows[0];

    // Auto-correct using existing UCLASS logic
    const given = String(answer ?? '');
    const correct = q.correct_answer;
    let isCorrect = false;
    if (q.question_type === 'fill_blank') {
      isCorrect = given.trim().toLowerCase() === (correct || '').trim().toLowerCase();
    } else if (q.question_type === 'matching') {
      try {
        const pairs = JSON.parse(q.passage || '[]');
        const parts = given.split('|').map(s => s.trim().toLowerCase());
        isCorrect = pairs.every((pair, i) => parts[i] === (pair.right || '').trim().toLowerCase());
      } catch { isCorrect = false; }
    } else {
      isCorrect = given.toLowerCase() === (correct || '').toLowerCase();
    }

    // For open-ended questions, mark as requiring review
    const requiresReview = q.question_type === 'open_ended' || !correct;

    // Upsert answer
    const result = await pool.query(
      `INSERT INTO coaching_session_answers (session_id, student_id, question_id, answer, is_correct, awarded_marks, requires_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (session_id, student_id, question_id)
       DO UPDATE SET answer = $4, is_correct = $5, awarded_marks = $6, requires_review = $7, answered_at = NOW()
       RETURNING *`,
      [sessionId, req.user.id, question_id, given, requiresReview ? null : isCorrect, isCorrect ? 1 : 0, requiresReview]
    );

    res.json({
      ...result.rows[0],
      feedback: requiresReview ? 'review' : (isCorrect ? 'correct' : 'incorrect'),
    });
  } catch (err) {
    console.error('[coaching] answer error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /coaching-sessions/:sessionId/results — get session results
router.get('/:classId/coaching-sessions/:sessionId/results', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

    const session = await pool.query('SELECT * FROM coaching_sessions WHERE id = $1 AND class_id = $2', [sessionId, classId]);
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });

    // Get all answers grouped by student
    const answers = await pool.query(
      `SELECT csa.student_id, u.name, u.email,
              COUNT(*) AS total_answered,
              COUNT(*) FILTER (WHERE csa.is_correct = TRUE) AS correct_count,
              COUNT(*) FILTER (WHERE csa.requires_review = TRUE) AS review_count,
              SUM(csa.awarded_marks) AS total_marks
       FROM coaching_session_answers csa
       JOIN users u ON u.id = csa.student_id
       WHERE csa.session_id = $1
       GROUP BY csa.student_id, u.name, u.email
       ORDER BY total_marks DESC NULLS LAST, u.name`,
      [sessionId]
    );

    // Get total questions
    let totalQuestions = 0;
    if (session.rows[0].quiz_id) {
      const qCount = await pool.query('SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = $1', [session.rows[0].quiz_id]);
      totalQuestions = parseInt(qCount.rows[0].count, 10);
    }

    const attendedCount = answers.rows.length;
    const avgPercentage = attendedCount > 0 && totalQuestions > 0
      ? Math.round(answers.rows.reduce((sum, r) => sum + (parseInt(r.total_marks || 0) / totalQuestions * 100), 0) / attendedCount)
      : 0;

    res.json({
      session: session.rows[0],
      total_questions: totalQuestions,
      attended_count: attendedCount,
      class_average: avgPercentage,
      students: answers.rows.map(r => ({
        ...r,
        total_answered: parseInt(r.total_answered),
        correct_count: parseInt(r.correct_count),
        review_count: parseInt(r.review_count),
        total_marks: parseInt(r.total_marks || 0),
        percentage: totalQuestions > 0 ? Math.round(parseInt(r.total_marks || 0) / totalQuestions * 100) : 0,
      })),
    });
  } catch (err) {
    console.error('[coaching] results error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /coaching-sessions/:sessionId/save-results — save results
// Only saves to quiz_attempts if count_toward_official is true (with attempt_source='coaching')
// Otherwise results stay in coaching_session_answers only (practice, not official grades)
router.post('/:classId/coaching-sessions/:sessionId/save-results', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not manage this class.' });

    const session = await pool.query('SELECT * FROM coaching_sessions WHERE id = $1 AND class_id = $2', [sessionId, classId]);
    if (session.rows.length === 0) return res.status(404).json({ error: 'Session not found.' });
    const sess = session.rows[0];

    // Get all answers for this session
    const answers = await pool.query(
      `SELECT student_id, question_id, answer, is_correct FROM coaching_session_answers WHERE session_id = $1`,
      [sessionId]
    );

    // Group by student
    const byStudent = {};
    for (const a of answers.rows) {
      if (!byStudent[a.student_id]) byStudent[a.student_id] = {};
      byStudent[a.student_id][a.question_id] = a.answer;
    }

    let saved = 0;
    let savedOfficial = 0;

    // Only save to quiz_attempts if teacher chose "count toward official assessment"
    if (sess.count_toward_official && sess.quiz_id) {
      const qCount = await pool.query('SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = $1', [sess.quiz_id]);
      const total = parseInt(qCount.rows[0].count, 10);

      for (const [studentId, studentAnswers] of Object.entries(byStudent)) {
        // Calculate score
        const questions = await pool.query('SELECT id, correct_answer, question_type FROM quiz_questions WHERE quiz_id = $1', [sess.quiz_id]);
        let score = 0;
        for (const q of questions.rows) {
          const given = String(studentAnswers[q.id] ?? '');
          if (q.question_type === 'fill_blank') {
            if (given.trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase()) score++;
          } else {
            if (given.toLowerCase() === (q.correct_answer || '').toLowerCase()) score++;
          }
        }

        // Check if attempt already exists (avoid duplicates)
        const existing = await pool.query(
          'SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2 AND COALESCE(group_assignment_id, 0) = 0',
          [sess.quiz_id, studentId]
        );

        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO quiz_attempts (quiz_id, student_id, score, total, answers, attempted_at, attempt_source)
             VALUES ($1, $2, $3, $4, $5, NOW(), 'coaching')`,
            [sess.quiz_id, studentId, score, total, JSON.stringify(studentAnswers)]
          );
          savedOfficial++;
        }
      }
    }

    saved = Object.keys(byStudent).length;

    // Mark session as completed
    await pool.query('UPDATE coaching_sessions SET status = $1 WHERE id = $2', ['completed', sessionId]);

    res.json({
      saved,
      saved_official: savedOfficial,
      total_students: Object.keys(byStudent).length,
      count_toward_official: sess.count_toward_official,
    });
  } catch (err) {
    console.error('[coaching] save-results error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /coaching-sessions/student/:studentId — get coaching sessions for a student (for parent portal)
router.get('/coaching-sessions/student/:studentId', authenticateToken, async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  try {
    // Parents can view their children's coaching sessions
    if (req.user.role === 'parent') {
      const child = await pool.query(
        `SELECT 1 FROM parent_children WHERE parent_id = $1 AND student_id = $2`,
        [req.user.id, studentId]
      );
      if (child.rows.length === 0) return res.status(403).json({ error: 'Not your child.' });
    } else if (req.user.role !== 'admin' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const sessions = await pool.query(
      `SELECT cs.id, cs.title, cs.topic, cs.status, cs.scheduled_at, cs.started_at, cs.ended_at,
              cs.count_toward_official, c.name AS class_name, u.name AS teacher_name,
              (SELECT COUNT(*) FROM coaching_session_answers csa WHERE csa.session_id = cs.id AND csa.student_id = $1) AS answered_count,
              (SELECT SUM(csa.awarded_marks) FROM coaching_session_answers csa WHERE csa.session_id = cs.id AND csa.student_id = $1) AS total_marks,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = cs.quiz_id) AS total_questions
       FROM coaching_session_participants csp
       JOIN coaching_sessions cs ON cs.id = csp.session_id
       JOIN classes c ON c.id = cs.class_id
       JOIN users u ON u.id = cs.teacher_id
       WHERE csp.student_id = $1
       ORDER BY cs.created_at DESC`,
      [studentId]
    );

    res.json(sessions.rows);
  } catch (err) {
    console.error('[coaching] student sessions error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── WebRTC signaling for audio ──────────────────────────────────────────────
// POST /coaching-sessions/:sessionId/signal — send a WebRTC signal (offer/answer/ice)
router.post('/:classId/coaching-sessions/:sessionId/signal', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  const { to_user_id, signal_type, signal_data } = req.body;
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });
    await pool.query(
      `INSERT INTO coaching_webrtc_signals (session_id, from_user_id, to_user_id, signal_type, signal_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, req.user.id, to_user_id || null, signal_type, signal_data]
    );
    res.json({ sent: true });
  } catch (err) {
    console.error('[coaching] signal send error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /coaching-sessions/:sessionId/signal — poll for signals addressed to me (or broadcast)
router.get('/:classId/coaching-sessions/:sessionId/signal', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  const sinceId = parseInt(req.query.since || '0', 10);
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });
    // Get signals addressed to me OR broadcast (to_user_id IS NULL), from others, since last poll
    const result = await pool.query(
      `SELECT id, from_user_id, signal_type, signal_data, created_at
       FROM coaching_webrtc_signals
       WHERE session_id = $1 AND id > $2 AND from_user_id <> $3
         AND (to_user_id IS NULL OR to_user_id = $3)
       ORDER BY id ASC LIMIT 50`,
      [sessionId, sinceId, req.user.id]
    );
    // Clean up old signals (> 30 seconds)
    await pool.query(
      `DELETE FROM coaching_webrtc_signals WHERE session_id = $1 AND created_at < NOW() - INTERVAL '30 seconds'`,
      [sessionId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[coaching] signal poll error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /coaching-sessions/:sessionId
router.delete('/:classId/coaching-sessions/:sessionId', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const sessionId = parseInt(req.params.sessionId, 10);
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not manage this class.' });
    await pool.query('DELETE FROM coaching_sessions WHERE id = $1 AND class_id = $2', [sessionId, classId]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
