const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const { ensureQuizReflectionSchema } = require('../lib/quizReflectionSchema');
const {
  notifyTeacherQuizReflection,
  notifyStudentTeacherReply,
} = require('../lib/quizReflectionNotify');

const router = express.Router();

ensureQuizReflectionSchema().catch((e) =>
  console.error('[quizReflectionSchema]', e.message)
);

async function loadClassMeta(classId) {
  const r = await pool.query(
    `SELECT c.id, c.name, c.subject, c.teacher_id, t.name AS teacher_name
     FROM classes c
     JOIN users t ON t.id = c.teacher_id
     WHERE c.id = $1`,
    [classId]
  );
  return r.rows[0] || null;
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
    reporter_student_id: row.reporter_student_id,
    reporter_name: row.reporter_name,
    teacher_comment: row.teacher_comment,
    teacher_commented_at: row.teacher_commented_at,
    teacher_name: row.teacher_name,
    student_read_at: row.student_read_at,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    members,
    has_teacher_reply: Boolean(row.teacher_comment),
    unread_teacher_reply: Boolean(row.teacher_comment && !row.student_read_at),
  };
}

async function loadMemberNotes(reportId) {
  const r = await pool.query(
    `SELECT * FROM quiz_reflection_member_notes
     WHERE report_id = $1 ORDER BY member_name`,
    [reportId]
  );
  return r.rows.map((m) => ({
    member_student_id: m.member_student_id,
    member_name: m.member_name,
    grade: m.grade,
    showed_weakness: m.showed_weakness,
    help_needed: m.help_needed,
    leader_comment: m.leader_comment,
  }));
}

// GET template for group quiz reflection (after submit)
router.get(
  '/:classId/group-quizzes/:assignmentId/reflection',
  authenticateToken,
  requireRole('student'),
  async (req, res) => {
    const classId = parseInt(req.params.classId, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    try {
      const row = await pool.query(
        `SELECT a.*, g.name AS group_name, g.leader_id, q.title AS quiz_title,
                c.subject, c.name AS class_name
         FROM class_group_quiz_assignments a
         JOIN class_groups g ON g.id = a.group_id
         JOIN quizzes q ON q.id = a.quiz_id
         JOIN classes c ON c.id = a.class_id
         WHERE a.id = $1 AND a.class_id = $2`,
        [assignmentId, classId]
      );
      const a = row.rows[0];
      if (!a) return res.status(404).json({ error: 'Assignment not found.' });
      if (a.status !== 'submitted') {
        return res.status(400).json({ error: 'Submit the group quiz first.' });
      }

      const members = await pool.query(
        `SELECT u.id, u.name, gm.team_role,
                (g.leader_id = u.id) AS is_leader
         FROM class_group_members gm
         JOIN users u ON u.id = gm.student_id
         JOIN class_groups g ON g.id = gm.group_id
         WHERE gm.group_id = $1
         ORDER BY u.name`,
        [a.group_id]
      );

      const existing = await pool.query(
        `SELECT r.*, u.name AS reporter_name, t.name AS teacher_name
         FROM quiz_reflection_reports r
         LEFT JOIN users u ON u.id = r.reporter_student_id
         LEFT JOIN users t ON t.id = r.teacher_id
         WHERE r.assignment_id = $1`,
        [assignmentId]
      );

      let report = null;
      if (existing.rows[0]) {
        const notes = await loadMemberNotes(existing.rows[0].id);
        report = formatReport(existing.rows[0], notes);
      }

      res.json({
        subject: a.subject || a.class_name,
        quiz_title: a.quiz_title,
        group_name: a.group_name,
        score: a.score,
        total: a.total,
        is_leader: a.leader_id === req.user.id,
        members: members.rows.map((m) => ({
          id: m.id,
          name: m.name,
          is_leader: m.is_leader,
          team_role: m.team_role,
        })),
        existing_report: report,
      });
    } catch (err) {
      console.error('[reflection template]', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// POST submit group reflection (Wear & send)
router.post(
  '/:classId/group-quizzes/:assignmentId/reflection',
  authenticateToken,
  requireRole('student'),
  async (req, res) => {
    const classId = parseInt(req.params.classId, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    const {
      subject,
      difficulty,
      improvement,
      student_question,
      crown_title_key,
      member_notes,
    } = req.body || {};

    try {
      const assign = await pool.query(
        `SELECT a.*, g.name AS group_name, q.title AS quiz_title, c.teacher_id, c.subject
         FROM class_group_quiz_assignments a
         JOIN class_groups g ON g.id = a.group_id
         JOIN quizzes q ON q.id = a.quiz_id
         JOIN classes c ON c.id = a.class_id
         WHERE a.id = $1 AND a.class_id = $2 AND a.status = 'submitted'`,
        [assignmentId, classId]
      );
      const a = assign.rows[0];
      if (!a) return res.status(404).json({ error: 'Submitted assignment not found.' });

      const inGroup = await pool.query(
        'SELECT 1 FROM class_group_members WHERE group_id = $1 AND student_id = $2',
        [a.group_id, req.user.id]
      );
      if (!inGroup.rows.length) {
        return res.status(403).json({ error: 'You are not in this group.' });
      }

      const dup = await pool.query(
        'SELECT id FROM quiz_reflection_reports WHERE assignment_id = $1 AND submitted_at IS NOT NULL',
        [assignmentId]
      );
      if (dup.rows.length) {
        return res.status(409).json({ error: 'Team report already submitted.' });
      }

      const reporter = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);

      const ins = await pool.query(
        `INSERT INTO quiz_reflection_reports (
           class_id, quiz_id, assignment_id, group_id, reporter_student_id,
           report_type, subject, quiz_title, group_name, difficulty, improvement,
           student_question, crown_title_key, score, total, teacher_id, submitted_at
         ) VALUES ($1,$2,$3,$4,$5,'group',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
         RETURNING id`,
        [
          classId,
          a.quiz_id,
          assignmentId,
          a.group_id,
          req.user.id,
          subject || a.subject,
          a.quiz_title,
          a.group_name,
          difficulty || null,
          improvement || null,
          student_question || null,
          crown_title_key || null,
          a.score,
          a.total,
          a.teacher_id,
        ]
      );
      const reportId = ins.rows[0].id;

      const notes = Array.isArray(member_notes) ? member_notes : [];
      for (const n of notes) {
        if (!n?.member_student_id) continue;
        const nameRow = await pool.query('SELECT name FROM users WHERE id = $1', [n.member_student_id]);
        await pool.query(
          `INSERT INTO quiz_reflection_member_notes
             (report_id, member_student_id, member_name, grade, showed_weakness, help_needed, leader_comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (report_id, member_student_id) DO UPDATE SET
             grade = EXCLUDED.grade,
             showed_weakness = EXCLUDED.showed_weakness,
             help_needed = EXCLUDED.help_needed,
             leader_comment = EXCLUDED.leader_comment`,
          [
            reportId,
            n.member_student_id,
            nameRow.rows[0]?.name || n.member_name,
            n.grade || null,
            Boolean(n.showed_weakness),
            n.help_needed || null,
            n.leader_comment || null,
          ]
        );
      }

      if (crown_title_key) {
        const { setDisplayedTitle } = require('../lib/achievementEngine');
        await setDisplayedTitle(req.user.id, classId, crown_title_key).catch(() => {});
      }

      await notifyTeacherQuizReflection({
        teacherId: a.teacher_id,
        classId,
        reportId,
        groupName: a.group_name,
        quizTitle: a.quiz_title,
        reporterName: reporter.rows[0]?.name || 'A student',
      });

      const full = await pool.query(
        `SELECT r.*, u.name AS reporter_name, t.name AS teacher_name
         FROM quiz_reflection_reports r
         LEFT JOIN users u ON u.id = r.reporter_student_id
         LEFT JOIN users t ON t.id = r.teacher_id
         WHERE r.id = $1`,
        [reportId]
      );
      const memberRows = await loadMemberNotes(reportId);
      res.status(201).json(formatReport(full.rows[0], memberRows));
    } catch (err) {
      console.error('[reflection submit group]', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// POST solo quiz reflection
router.post(
  '/:classId/quizzes/:quizId/reflection',
  authenticateToken,
  requireRole('student'),
  async (req, res) => {
    const classId = parseInt(req.params.classId, 10);
    const quizId = parseInt(req.params.quizId, 10);
    const { subject, difficulty, improvement, student_question, crown_title_key } = req.body || {};
    try {
      const meta = await pool.query(
        `SELECT q.title AS quiz_title, c.subject, c.teacher_id, c.name AS class_name
         FROM quizzes q JOIN classes c ON c.id = q.class_id
         WHERE q.id = $1 AND q.class_id = $2`,
        [quizId, classId]
      );
      const m = meta.rows[0];
      if (!m) return res.status(404).json({ error: 'Quiz not found.' });

      const attempt = await pool.query(
        `SELECT score, total FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2 ORDER BY attempted_at DESC LIMIT 1`,
        [quizId, req.user.id]
      );
      if (!attempt.rows.length) {
        return res.status(400).json({ error: 'Complete the quiz first.' });
      }

      const dup = await pool.query(
        `SELECT id FROM quiz_reflection_reports
         WHERE quiz_id = $1 AND reporter_student_id = $2 AND assignment_id IS NULL AND submitted_at IS NOT NULL`,
        [quizId, req.user.id]
      );
      if (dup.rows.length) {
        return res.status(409).json({ error: 'You already sent this report.' });
      }

      const reporter = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
      const { score, total } = attempt.rows[0];

      const ins = await pool.query(
        `INSERT INTO quiz_reflection_reports (
           class_id, quiz_id, reporter_student_id, report_type, subject, quiz_title,
           difficulty, improvement, student_question, crown_title_key, score, total,
           teacher_id, submitted_at
         ) VALUES ($1,$2,$3,'solo',$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         RETURNING id`,
        [
          classId,
          quizId,
          req.user.id,
          subject || m.subject,
          m.quiz_title,
          difficulty,
          improvement,
          student_question,
          crown_title_key,
          score,
          total,
          m.teacher_id,
        ]
      );

      if (crown_title_key) {
        const { setDisplayedTitle } = require('../lib/achievementEngine');
        await setDisplayedTitle(req.user.id, classId, crown_title_key).catch(() => {});
      }

      await notifyTeacherQuizReflection({
        teacherId: m.teacher_id,
        classId,
        reportId: ins.rows[0].id,
        groupName: null,
        quizTitle: m.quiz_title,
        reporterName: reporter.rows[0]?.name || 'A student',
      });

      res.status(201).json({ id: ins.rows[0].id, ok: true });
    } catch (err) {
      console.error('[reflection submit solo]', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// Teacher: list reports for class
router.get(
  '/:classId/quiz-reports',
  authenticateToken,
  requireRole('teacher', 'head_teacher'),
  async (req, res) => {
    const classId = parseInt(req.params.classId, 10);
    try {
      const manage = await userCanManageClass(req.user, classId);
      if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

      const r = await pool.query(
        `SELECT r.*, u.name AS reporter_name, t.name AS teacher_name
         FROM quiz_reflection_reports r
         LEFT JOIN users u ON u.id = r.reporter_student_id
         LEFT JOIN users t ON t.id = r.teacher_id
         WHERE r.class_id = $1 AND r.submitted_at IS NOT NULL
         ORDER BY r.submitted_at DESC
         LIMIT 80`,
        [classId]
      );

      const out = [];
      for (const row of r.rows) {
        const notes = await loadMemberNotes(row.id);
        out.push(formatReport(row, notes));
      }
      res.json(out);
    } catch (err) {
      console.error('[quiz-reports list teacher]', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// Teacher: reply to report
router.put(
  '/:classId/quiz-reports/:reportId/reply',
  authenticateToken,
  requireRole('teacher', 'head_teacher'),
  async (req, res) => {
    const classId = parseInt(req.params.classId, 10);
    const reportId = parseInt(req.params.reportId, 10);
    const { teacher_comment } = req.body || {};
    if (!teacher_comment || !String(teacher_comment).trim()) {
      return res.status(400).json({ error: 'Comment is required.' });
    }
    try {
      const manage = await userCanManageClass(req.user, classId);
      if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

      const row = await pool.query(
        `SELECT r.*, u.name AS reporter_name
         FROM quiz_reflection_reports r
         JOIN users u ON u.id = r.reporter_student_id
         WHERE r.id = $1 AND r.class_id = $2`,
        [reportId, classId]
      );
      const report = row.rows[0];
      if (!report) return res.status(404).json({ error: 'Report not found.' });

      await pool.query(
        `UPDATE quiz_reflection_reports
         SET teacher_comment = $3, teacher_id = $4, teacher_commented_at = NOW(), student_read_at = NULL
         WHERE id = $1 AND class_id = $2`,
        [reportId, classId, String(teacher_comment).trim(), req.user.id]
      );

      const teacher = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
      await notifyStudentTeacherReply({
        studentId: report.reporter_student_id,
        classId,
        reportId,
        quizTitle: report.quiz_title,
        teacherName: teacher.rows[0]?.name || 'Your teacher',
      });

      const updated = await pool.query(
        `SELECT r.*, u.name AS reporter_name, t.name AS teacher_name
         FROM quiz_reflection_reports r
         LEFT JOIN users u ON u.id = r.reporter_student_id
         LEFT JOIN users t ON t.id = r.teacher_id
         WHERE r.id = $1`,
        [reportId]
      );
      const notes = await loadMemberNotes(reportId);
      res.json(formatReport(updated.rows[0], notes));
    } catch (err) {
      console.error('[quiz-reports reply]', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

module.exports = router;
