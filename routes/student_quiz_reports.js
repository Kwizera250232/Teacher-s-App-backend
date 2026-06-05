const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { ensureQuizReflectionSchema } = require('../lib/quizReflectionSchema');

const router = express.Router();

ensureQuizReflectionSchema().catch(() => {});

async function loadMemberNotes(reportId) {
  const r = await pool.query(
    `SELECT * FROM quiz_reflection_member_notes WHERE report_id = $1 ORDER BY member_name`,
    [reportId]
  );
  return r.rows;
}

function formatReport(row, members = []) {
  return {
    id: row.id,
    class_id: row.class_id,
    quiz_id: row.quiz_id,
    assignment_id: row.assignment_id,
    group_id: row.group_id,
    report_type: row.report_type,
    subject: row.subject,
    quiz_title: row.quiz_title,
    group_name: row.group_name,
    difficulty: row.difficulty,
    improvement: row.improvement,
    student_question: row.student_question,
    crown_title_key: row.crown_title_key,
    score: row.score,
    total: row.total,
    teacher_comment: row.teacher_comment,
    teacher_commented_at: row.teacher_commented_at,
    teacher_name: row.teacher_name,
    student_read_at: row.student_read_at,
    submitted_at: row.submitted_at,
    members: members.map((m) => ({
      member_student_id: m.member_student_id,
      member_name: m.member_name,
      grade: m.grade,
      showed_weakness: m.showed_weakness,
      help_needed: m.help_needed,
      leader_comment: m.leader_comment,
    })),
    unread_teacher_reply: Boolean(row.teacher_comment && !row.student_read_at),
  };
}

// GET all my quiz reports (history)
router.get('/', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, t.name AS teacher_name
       FROM quiz_reflection_reports r
       LEFT JOIN users t ON t.id = r.teacher_id
       WHERE r.reporter_student_id = $1 AND r.submitted_at IS NOT NULL
       ORDER BY r.submitted_at DESC
       LIMIT 60`,
      [req.user.id]
    );
    const out = [];
    for (const row of r.rows) {
      const notes = row.report_type === 'group' ? await loadMemberNotes(row.id) : [];
      out.push(formatReport(row, notes));
    }
    res.json(out);
  } catch (err) {
    console.error('[student quiz-reports]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET one unread teacher reply for dashboard popup
router.get('/popup', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, t.name AS teacher_name
       FROM quiz_reflection_reports r
       LEFT JOIN users t ON t.id = r.teacher_id
       WHERE r.reporter_student_id = $1
         AND r.teacher_comment IS NOT NULL
         AND r.student_read_at IS NULL
       ORDER BY r.teacher_commented_at DESC
       LIMIT 1`,
      [req.user.id]
    );
    if (!r.rows[0]) return res.json(null);
    const notes = r.rows[0].report_type === 'group'
      ? await loadMemberNotes(r.rows[0].id)
      : [];
    res.json(formatReport(r.rows[0], notes));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT mark teacher comment as read (popup dismiss → history)
router.put('/:reportId/read', authenticateToken, requireRole('student'), async (req, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  try {
    await pool.query(
      `UPDATE quiz_reflection_reports
       SET student_read_at = NOW()
       WHERE id = $1 AND reporter_student_id = $2`,
      [reportId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
