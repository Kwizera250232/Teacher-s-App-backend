const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { claimShareForUser, guestHasClassAccess } = require('../lib/quizShares');
const { assertGuestClassAccess } = require('../lib/guestClassAccess');
const { convertGuestToTeacher, convertGuestToStudent } = require('../lib/guestConversion');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/claim-share', authenticateToken, requireRole('guest'), async (req, res) => {
  const token = String(req.body.share_token || req.body.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Share token required.' });
  try {
    const share = await claimShareForUser(req.user.id, token);
    if (!share) return res.status(404).json({ error: 'Invalid or expired quiz link.' });
    res.json({
      class_id: share.class_id,
      quiz_id: share.quiz_id,
      class_name: share.class_name,
      quiz_title: share.quiz_title,
    });
  } catch (err) {
    console.error('[guest/claim-share]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

async function loadGuestClasses(userId) {
  const classes = await pool.query(
    `SELECT gca.class_id, c.name AS class_name, c.subject,
            u.id AS teacher_id, u.name AS teacher_name,
            gca.granted_via_quiz_id,
            gca.granted_via_teacher_id,
            gca.created_at AS access_granted_at
     FROM guest_class_access gca
     JOIN classes c ON c.id = gca.class_id
     JOIN users u ON u.id = c.teacher_id
     WHERE gca.user_id = $1
     ORDER BY u.name, c.name, gca.created_at DESC`,
    [userId]
  );
  return classes.rows;
}

router.post('/convert-account', authenticateToken, requireRole('guest'), async (req, res) => {
  const target = String(req.body.target_role || req.body.role || '').trim().toLowerCase();
  try {
    let result;
    if (target === 'teacher') {
      result = await convertGuestToTeacher(req.user.id, {
        schoolEmailLocal: req.body.school_email_local,
        staffSchoolName: req.body.staff_school_name || req.body.school_name,
      });
    } else if (target === 'student') {
      result = await convertGuestToStudent(req.user.id, {
        schoolEmailLocal: req.body.school_email_local,
        classCode: req.body.class_code,
        email: req.body.email,
      });
    } else {
      return res.status(400).json({ error: 'Choose teacher or student account type.' });
    }

    const token = jwt.sign(
      { id: result.user.id, role: result.user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: result.user,
      login_email: result.login_email,
      joined_class: result.joined_class || null,
      message:
        target === 'teacher'
          ? 'Your account is now a teacher. Quiz history is saved; create classes from your dashboard.'
          : 'Your account is now a student. You joined your class and keep your guest quiz scores.',
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[guest/convert-account]', err);
    res.status(status).json({ error: err.message || 'Conversion failed.' });
  }
});

router.get('/hub', authenticateToken, requireRole('guest'), async (req, res) => {
  try {
    const classRows = await loadGuestClasses(req.user.id);
    const classIds = classRows.map((r) => r.class_id);

    let quizzesByClass = [];
    let announcementCounts = [];
    let noteCounts = [];
    let homeworkCounts = [];

    if (classIds.length) {
      const [qz, ann, notes, hw] = await Promise.all([
        pool.query(
          `SELECT q.id, q.class_id, q.title, q.description, q.created_at,
                  EXISTS(
                    SELECT 1 FROM quiz_attempts qa
                    WHERE qa.quiz_id = q.id AND qa.student_id = $1
                  ) AS attempted,
                  lat.score AS last_score,
                  lat.total AS last_total,
                  lat.attempted_at AS last_attempted_at
           FROM quizzes q
           LEFT JOIN LATERAL (
             SELECT qa.score, qa.total, qa.attempted_at
             FROM quiz_attempts qa
             WHERE qa.quiz_id = q.id AND qa.student_id = $1
             ORDER BY qa.attempted_at DESC
             LIMIT 1
           ) lat ON TRUE
           WHERE q.class_id = ANY($2::int[])
           ORDER BY q.created_at DESC`,
          [req.user.id, classIds]
        ),
        pool.query(
          `SELECT class_id, COUNT(*)::int AS n FROM announcements
           WHERE class_id = ANY($1::int[]) GROUP BY class_id`,
          [classIds]
        ),
        pool.query(
          `SELECT class_id, COUNT(*)::int AS n FROM notes
           WHERE class_id = ANY($1::int[]) GROUP BY class_id`,
          [classIds]
        ),
        pool.query(
          `SELECT class_id, COUNT(*)::int AS n FROM homework
           WHERE class_id = ANY($1::int[]) GROUP BY class_id`,
          [classIds]
        ),
      ]);
      quizzesByClass = qz.rows;
      announcementCounts = ann.rows;
      noteCounts = notes.rows;
      homeworkCounts = hw.rows;
    }

    const attempts = await pool.query(
      `SELECT qa.id, qa.score, qa.total, qa.attempted_at,
              qz.title AS quiz_title, qz.id AS quiz_id,
              c.id AS class_id, c.name AS class_name
       FROM quiz_attempts qa
       JOIN quizzes qz ON qz.id = qa.quiz_id
       JOIN classes c ON c.id = qz.class_id
       WHERE qa.student_id = $1 AND qa.is_guest = TRUE
       ORDER BY qa.attempted_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const allQuizzes = quizzesByClass.map((q) => ({
      ...q,
      class_name: classRows.find((c) => c.class_id === q.class_id)?.class_name,
      teacher_name: classRows.find((c) => c.class_id === q.class_id)?.teacher_name,
    }));
    const pendingQuizzes = allQuizzes.filter((q) => !q.attempted);
    const completedQuizzes = allQuizzes.filter((q) => q.attempted);

    const countMap = (rows) =>
      Object.fromEntries(rows.map((r) => [r.class_id, r.n]));

    const annMap = countMap(announcementCounts);
    const notesMap = countMap(noteCounts);
    const hwMap = countMap(homeworkCounts);

    const teacherNames = [...new Set(classRows.map((c) => c.teacher_name).filter(Boolean))];

    res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: 'guest',
      },
      sharing_teachers: teacherNames,
      quiz_access_note:
        teacherNames.length > 0
          ? `You can take all quizzes in classes taught by ${teacherNames.join(', ')} (unlocked via share link).`
          : null,
      classes: classRows.map((c) => ({
        ...c,
        quizzes: quizzesByClass
          .filter((q) => Number(q.class_id) === Number(c.class_id))
          .map((q) => ({
            ...q,
            score: q.last_score,
            total: q.last_total,
            attempted_at: q.last_attempted_at,
          })),
        counts: {
          announcements: annMap[c.class_id] || 0,
          notes: notesMap[c.class_id] || 0,
          homework: hwMap[c.class_id] || 0,
          quizzes: quizzesByClass.filter((q) => Number(q.class_id) === Number(c.class_id)).length,
        },
      })),
      all_quizzes: allQuizzes.map((q) => ({
        ...q,
        score: q.last_score,
        total: q.last_total,
        attempted_at: q.last_attempted_at,
      })),
      attempts: attempts.rows,
      quizzes_pending: pendingQuizzes,
      quizzes_completed: completedQuizzes,
      features: {
        can_submit_homework: false,
        can_join_class: false,
        can_see_classmates: false,
        can_see_leaderboard: false,
        can_see_discussion: false,
        can_see_feed: false,
      },
    });
  } catch (err) {
    console.error('[guest/hub]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/profile', authenticateToken, requireRole('guest'), async (req, res) => {
  try {
    const profile = await pool.query(
      `SELECT u.id, u.name, u.email, u.role,
              p.avatar_path, p.phone,
              (SELECT COUNT(*)::int FROM quiz_attempts WHERE student_id = u.id AND is_guest = TRUE) AS quizzes_taken,
              (SELECT COUNT(DISTINCT class_id)::int FROM guest_class_access WHERE user_id = u.id) AS classes_unlocked
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!profile.rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(profile.rows[0]);
  } catch (err) {
    console.error('[guest/profile]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/classes/:classId', authenticateToken, requireRole('guest'), async (req, res) => {
  const access = await assertGuestClassAccess(req.user.id, req.params.classId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.subject, c.class_code, c.created_at,
              u.name AS teacher_name
       FROM classes c
       JOIN users u ON u.id = c.teacher_id
       WHERE c.id = $1`,
      [access.classId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Class not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[guest/class]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/classes/:classId/announcements', authenticateToken, requireRole('guest'), async (req, res) => {
  const access = await assertGuestClassAccess(req.user.id, req.params.classId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  try {
    const result = await pool.query(
      `SELECT a.id, a.content, a.created_at, u.name AS teacher_name
       FROM announcements a
       JOIN users u ON u.id = a.teacher_id
       WHERE a.class_id = $1
       ORDER BY a.created_at DESC`,
      [access.classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[guest/announcements]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/classes/:classId/notes', authenticateToken, requireRole('guest'), async (req, res) => {
  const access = await assertGuestClassAccess(req.user.id, req.params.classId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  try {
    const result = await pool.query(
      `SELECT id, title, file_path, file_name, created_at
       FROM notes WHERE class_id = $1 ORDER BY created_at DESC`,
      [access.classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[guest/notes]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/classes/:classId/homework', authenticateToken, requireRole('guest'), async (req, res) => {
  const access = await assertGuestClassAccess(req.user.id, req.params.classId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  try {
    const result = await pool.query(
      `SELECT id, title, description, due_date, file_path, file_name, created_at
       FROM homework WHERE class_id = $1 ORDER BY created_at DESC`,
      [access.classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[guest/homework]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/classes/:classId/quizzes', authenticateToken, requireRole('guest'), async (req, res) => {
  const access = await assertGuestClassAccess(req.user.id, req.params.classId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  try {
    const result = await pool.query(
      `SELECT q.id, q.title, q.description, q.created_at,
              EXISTS(
                SELECT 1 FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.student_id = $1
              ) AS attempted,
              lat.score AS score,
              lat.total AS total,
              lat.attempted_at
       FROM quizzes q
       LEFT JOIN LATERAL (
         SELECT qa.score, qa.total, qa.attempted_at
         FROM quiz_attempts qa
         WHERE qa.quiz_id = q.id AND qa.student_id = $1
         ORDER BY qa.attempted_at DESC
         LIMIT 1
       ) lat ON TRUE
       WHERE q.class_id = $2
       ORDER BY q.created_at DESC`,
      [req.user.id, access.classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[guest/class quizzes]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
