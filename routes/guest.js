const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { claimShareForUser, guestHasClassAccess } = require('../lib/quizShares');

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

router.get('/hub', authenticateToken, requireRole('guest'), async (req, res) => {
  try {
    const classes = await pool.query(
      `SELECT gca.class_id, c.name AS class_name, c.subject,
              u.name AS teacher_name,
              gca.granted_via_quiz_id
       FROM guest_class_access gca
       JOIN classes c ON c.id = gca.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE gca.user_id = $1
       ORDER BY gca.created_at DESC`,
      [req.user.id]
    );

    const classIds = classes.rows.map((r) => r.class_id);
    let quizzesByClass = [];
    if (classIds.length) {
      const qz = await pool.query(
        `SELECT q.id, q.class_id, q.title, q.description, q.created_at,
                EXISTS(
                  SELECT 1 FROM quiz_attempts qa
                  WHERE qa.quiz_id = q.id AND qa.student_id = $1
                ) AS attempted
         FROM quizzes q
         WHERE q.class_id = ANY($2::int[])
         ORDER BY q.created_at DESC`,
        [req.user.id, classIds]
      );
      quizzesByClass = qz.rows;
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

    res.json({
      classes: classes.rows.map((c) => ({
        ...c,
        quizzes: quizzesByClass.filter((q) => q.class_id === c.class_id),
      })),
      attempts: attempts.rows,
    });
  } catch (err) {
    console.error('[guest/hub]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/classes/:classId/quizzes', authenticateToken, requireRole('guest'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (!classId) return res.status(400).json({ error: 'Invalid class.' });
  try {
    const ok = await guestHasClassAccess(req.user.id, classId);
    if (!ok) return res.status(403).json({ error: 'You do not have access to this class quiz list.' });
    const result = await pool.query(
      `SELECT q.id, q.title, q.description, q.created_at,
              EXISTS(
                SELECT 1 FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.student_id = $1
              ) AS attempted
       FROM quizzes q
       WHERE q.class_id = $2
       ORDER BY q.created_at DESC`,
      [req.user.id, classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[guest/class quizzes]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
