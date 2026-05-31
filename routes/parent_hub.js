const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { schoolDomainFromName, normalizeLocalPart, buildSchoolEmail } = require('../lib/schoolDomain');
const { createSchoolAccount } = require('./admin');
const {
  ensureParentHubSchema,
  insertParentNotification,
  sendParentInAppMessage,
  resolveParentRecipients,
} = require('../lib/parentHub');
const { runParentDailyReminders } = require('../lib/parentReminders');
const { periodClause } = require('../lib/periodFilters');
const { maybeEmailParent } = require('../lib/parentNotifyEmail');

const router = express.Router();

ensureParentHubSchema().catch((e) => console.error('[parent_hub] schema:', e.message));

const SQL_PARENT_NOTIF_SCOPE = `
  parent_id = $1 AND (
    student_id IN (SELECT student_id FROM parent_children WHERE parent_id = $1)
    OR (student_id IS NULL AND type = 'school_announcement')
  )`;

async function getSenderSchoolId(user) {
  if (user.school_id) return user.school_id;
  const row = await pool.query('SELECT school_id FROM users WHERE id = $1', [user.id]);
  return row.rows[0]?.school_id || null;
}

async function parentOwnsStudent(parentId, studentId) {
  const r = await pool.query(
    'SELECT 1 FROM parent_children WHERE parent_id = $1 AND student_id = $2',
    [parentId, studentId]
  );
  return r.rows.length > 0;
}

// ── Parent hub overview ───────────────────────────────────────────────────────
router.get('/hub', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    const unreadRow = await pool.query(
      `SELECT COUNT(*)::int AS c FROM parent_notifications
       WHERE ${SQL_PARENT_NOTIF_SCOPE} AND is_read = FALSE`,
      [req.user.id]
    );
    const unreadCount = unreadRow.rows[0]?.c || 0;

    const children = await pool.query(
      `SELECT u.id, u.name,
              s.id AS school_id, s.name AS school_name, s.district, s.sector, s.location
       FROM parent_children pc
       JOIN users u ON u.id = pc.student_id
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE pc.parent_id = $1`,
      [req.user.id]
    );

    const announcements = await pool.query(
      `SELECT sa.*, u.name AS author_name, s.name AS school_name
       FROM school_announcements sa
       JOIN users u ON u.id = sa.created_by
       JOIN schools s ON s.id = sa.school_id
       WHERE sa.school_id IN (
         SELECT DISTINCT st.school_id FROM parent_children pc
         JOIN users st ON st.id = pc.student_id WHERE pc.parent_id = $1 AND st.school_id IS NOT NULL
       )
       ORDER BY sa.is_pinned DESC, sa.created_at DESC LIMIT 30`,
      [req.user.id]
    );

    await runParentDailyReminders(req.user.id).catch((e) =>
      console.error('[parent reminders]', e.message)
    );

    const notificationsAfter = await pool.query(
      `SELECT * FROM parent_notifications
       WHERE ${SQL_PARENT_NOTIF_SCOPE}
       ORDER BY created_at DESC LIMIT 40`,
      [req.user.id]
    );

    const unreadAfter = await pool.query(
      `SELECT COUNT(*)::int AS c FROM parent_notifications
       WHERE ${SQL_PARENT_NOTIF_SCOPE} AND is_read = FALSE`,
      [req.user.id]
    );

    const teachers = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role,
              c.name AS class_name, c.subject, st.name AS student_name
       FROM parent_children pc
       JOIN users st ON st.id = pc.student_id
       JOIN class_members cm ON cm.student_id = st.id
       JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE pc.parent_id = $1
       UNION
       SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role,
              c.name AS class_name, c.subject, st.name AS student_name
       FROM parent_children pc
       JOIN users st ON st.id = pc.student_id
       JOIN class_members cm ON cm.student_id = st.id
       JOIN class_co_teachers ct ON ct.class_id = cm.class_id
       JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = ct.teacher_id
       WHERE pc.parent_id = $1
       UNION
       SELECT DISTINCT ht.id, ht.name, ht.email, ht.phone, ht.role,
              NULL AS class_name, NULL AS subject, st.name AS student_name
       FROM parent_children pc
       JOIN users st ON st.id = pc.student_id
       JOIN users ht ON ht.school_id = st.school_id
         AND ht.role = 'head_teacher' AND ht.is_approved = TRUE
       WHERE pc.parent_id = $1 AND st.school_id IS NOT NULL
       ORDER BY name`,
      [req.user.id]
    );

    res.json({
      children: children.rows,
      announcements: announcements.rows,
      notifications: notificationsAfter.rows,
      unread_notifications_count: unreadAfter.rows[0]?.c ?? unreadCount,
      teachers: teachers.rows,
    });
  } catch (err) {
    console.error('[parent hub]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/notifications', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM parent_notifications WHERE ${SQL_PARENT_NOTIF_SCOPE} ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/notifications/:id/read', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE parent_notifications SET is_read = TRUE
       WHERE id = $1 AND parent_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/notifications/read-all', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    await pool.query('UPDATE parent_notifications SET is_read = TRUE WHERE parent_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Child academic summary for parent
router.get('/children/:studentId/summary', authenticateToken, requireRole('parent'), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  if (!(await parentOwnsStudent(req.user.id, studentId))) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const period = String(req.query.period || 'all').toLowerCase();
  try {
    const student = await pool.query(
      `SELECT u.id, u.name, s.name AS school_name, s.district, s.sector, s.location, s.welcome_message
       FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE u.id = $1`,
      [studentId]
    );
    const classes = await pool.query(
      `SELECT c.id, c.name, c.subject, u.name AS teacher_name, u.email AS teacher_email, u.phone AS teacher_phone
       FROM class_members cm JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE cm.student_id = $1`,
      [studentId]
    );

    const teachers = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role, c.name AS class_name, c.subject
       FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE cm.student_id = $1
       UNION
       SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role, c.name AS class_name, c.subject
       FROM class_members cm
       JOIN class_co_teachers ct ON ct.class_id = cm.class_id
       JOIN classes c ON c.id = cm.class_id
       JOIN users u ON u.id = ct.teacher_id
       WHERE cm.student_id = $1
       ORDER BY name`,
      [studentId]
    );

    const quizPeriod = periodClause(period, 'qa.attempted_at');
    const quizzes = await pool.query(
      `SELECT q.id AS quiz_id, q.title, q.created_at, qa.id AS attempt_id, qa.score, qa.total,
              qa.attempted_at, c.name AS class_name, c.id AS class_id
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       JOIN classes c ON c.id = q.class_id
       JOIN class_members cm ON cm.class_id = c.id AND cm.student_id = $1
       WHERE qa.student_id = $1 ${quizPeriod.sql}
       ORDER BY qa.attempted_at DESC LIMIT 30`,
      [studentId]
    );

    const hwPeriod = periodClause(period, 'COALESCE(hs.submitted_at, h.created_at)');
    const homework = await pool.query(
      `SELECT h.title, h.due_date, hs.submitted_at, hs.grade, c.name AS class_name
       FROM homework h
       JOIN classes c ON c.id = h.class_id
       JOIN class_members cm ON cm.class_id = c.id AND cm.student_id = $1
       LEFT JOIN homework_submissions hs ON hs.homework_id = h.id AND hs.student_id = $1
       WHERE cm.student_id = $1 ${hwPeriod.sql}
       ORDER BY COALESCE(hs.submitted_at, h.created_at) DESC LIMIT 30`,
      [studentId]
    );

    const marksPeriod = periodClause(period, 'cm.test_date');
    const marks = await pool.query(
      `SELECT cm.test_number, cm.marks_obtained, cm.total_marks, cm.test_date, c.name AS class_name
       FROM cat_marks cm
       JOIN classes c ON c.id = cm.class_id
       JOIN class_members mem ON mem.class_id = c.id AND mem.student_id = $1
       WHERE cm.student_id = $1 ${marksPeriod.sql}
       ORDER BY cm.test_date DESC NULLS LAST LIMIT 40`,
      [studentId]
    ).catch(() => ({ rows: [] }));

    const digests = await pool.query(
      `SELECT digest_json, created_at FROM parent_weekly_digests
       WHERE student_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [studentId]
    );

    const shares = await pool.query(
      `SELECT type AS title, content AS body, status, created_at FROM student_shares
       WHERE student_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [studentId]
    ).catch(() => ({ rows: [] }));

    res.json({
      period,
      student: student.rows[0],
      classes: classes.rows,
      teachers: teachers.rows,
      quizzes: quizzes.rows,
      homework: homework.rows,
      marks: marks.rows,
      weekly_digests: digests.rows,
      compositions: shares.rows,
    });
  } catch (err) {
    console.error('[parent summary]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// CAT marks Word export (single child, per class) — uses same shape as downloadCatSheetWord
router.get('/children/:studentId/marks-export', authenticateToken, requireRole('parent'), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  if (!(await parentOwnsStudent(req.user.id, studentId))) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  try {
    const studentRow = await pool.query(
      `SELECT u.name, s.name AS school_name FROM users u
       LEFT JOIN schools s ON s.id = u.school_id WHERE u.id = $1`,
      [studentId]
    );
    const studentName = studentRow.rows[0]?.name || 'Student';
    const schoolName = studentRow.rows[0]?.school_name || '';

    const classRows = await pool.query(
      `SELECT c.id, c.name, c.subject, t.name AS teacher_name
       FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       JOIN users t ON t.id = c.teacher_id
       WHERE cm.student_id = $1`,
      [studentId]
    );

    const exports = [];
    for (const cls of classRows.rows) {
      const marksRows = await pool.query(
        `SELECT test_number, marks_obtained, total_marks FROM cat_marks
         WHERE class_id = $1 AND student_id = $2 ORDER BY test_number`,
        [cls.id, studentId]
      );
      const cats = Array.from({ length: 10 }, (_, i) => {
        const row = marksRows.rows.find((r) => r.test_number === i + 1);
        return row ? row.marks_obtained : '';
      });
      let sumMarks = 0;
      let sumTotal = 0;
      marksRows.rows.forEach((r) => {
        sumMarks += Number(r.marks_obtained) || 0;
        sumTotal += Number(r.total_marks) || 100;
      });
      const percentage = sumTotal > 0 ? Math.round((1000 * sumMarks) / sumTotal) / 10 : 0;
      exports.push({
        class_id: cls.id,
        class_name: cls.name,
        subject: cls.subject,
        teacher_name: cls.teacher_name,
        school_name: schoolName,
        rows: [{
          student_name: studentName,
          cats,
          total: sumMarks,
          percentage,
        }],
      });
    }

    res.json({ student_name: studentName, school_name: schoolName, exports });
  } catch (err) {
    console.error('[parent marks-export]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Quiz result detail for parent Word download
router.get('/children/:studentId/quizzes/:quizId/report', authenticateToken, requireRole('parent'), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const quizId = parseInt(req.params.quizId, 10);
  if (!(await parentOwnsStudent(req.user.id, studentId))) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  try {
    const attemptResult = await pool.query(
      `SELECT qa.*, u.name AS student_name, qz.title AS quiz_title, c.name AS class_name,
              c.subject AS class_subject, t.name AS teacher_name, s.name AS school_name,
              (SELECT COUNT(*)::int FROM quizzes q2
               WHERE q2.class_id = qz.class_id AND q2.created_at <= qz.created_at) AS quiz_number
       FROM quiz_attempts qa
       JOIN users u ON u.id = qa.student_id
       JOIN quizzes qz ON qz.id = qa.quiz_id
       JOIN classes c ON c.id = qz.class_id
       JOIN class_members cm ON cm.class_id = c.id AND cm.student_id = qa.student_id
       JOIN users t ON t.id = c.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id
       WHERE qa.quiz_id = $1 AND qa.student_id = $2
       ORDER BY qa.attempted_at DESC LIMIT 1`,
      [quizId, studentId]
    );
    if (!attemptResult.rows.length) {
      return res.status(404).json({ error: 'No quiz attempt found for this child.' });
    }
    const attempt = attemptResult.rows[0];
    const answers = attempt.answers || {};
    const questionsResult = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [quizId]
    );
    const optionMap = { a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d' };
    const detailed = questionsResult.rows.map((q, idx) => {
      const studentAnswer = String(answers[String(q.id)] ?? '');
      const correctAnswer = q.correct_answer;
      const qtype = q.question_type || 'multiple_choice';
      let isCorrect = false;
      if (qtype === 'fill_blank') {
        isCorrect = studentAnswer.trim().toLowerCase() === (correctAnswer || '').trim().toLowerCase();
      } else if (qtype === 'matching') {
        try {
          const pairs = JSON.parse(q.passage || '[]');
          const parts = studentAnswer.split('|');
          isCorrect = pairs.length > 0 && pairs.every((p, i) =>
            (parts[i] || '').trim().toLowerCase() === p.right.trim().toLowerCase());
        } catch {
          isCorrect = false;
        }
      } else {
        isCorrect = studentAnswer.toLowerCase() === (correctAnswer || '').toLowerCase();
      }
      return {
        number: idx + 1,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        student_answer: studentAnswer || 'No answer',
        student_answer_text: studentAnswer ? (q[optionMap[studentAnswer.toLowerCase()]] || studentAnswer) : 'No answer',
        correct_answer: correctAnswer,
        correct_answer_text: q[optionMap[(correctAnswer || '').toLowerCase()]] || correctAnswer,
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
    console.error('[parent quiz report]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Staff: list parents for notify UI
router.get('/school/parents', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const schoolId = await getSenderSchoolId(req.user);
    if (!schoolId) return res.json([]);
    const classId = req.query.class_id ? parseInt(req.query.class_id, 10) : null;
    let query;
    if (classId) {
      query = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, st.name AS student_name, st.id AS student_id
         FROM class_members cm
         JOIN users st ON st.id = cm.student_id
         JOIN parent_children pc ON pc.student_id = st.id
         JOIN users u ON u.id = pc.parent_id
         WHERE cm.class_id = $1`,
        [classId]
      );
    } else {
      query = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, st.name AS student_name, st.id AS student_id
         FROM parent_children pc
         JOIN users st ON st.id = pc.student_id
         JOIN users u ON u.id = pc.parent_id
         WHERE st.school_id = $1`,
        [schoolId]
      );
    }
    res.json(query.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Staff: broadcast to parent(s) — in-app notification + chat message
router.post('/notify', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const {
    title,
    body,
    type,
    student_id,
    class_id,
    parent_ids,
    audience,
    also_email: alsoEmail,
  } = req.body;
  const messageTitle = (title || '').trim();
  const messageBody = (body || '').trim();
  if (!messageTitle || !messageBody) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }

  try {
    const schoolId = await getSenderSchoolId(req.user);
    let recipients;
    if (audience === 'all' && schoolId) {
      recipients = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        schoolId,
      });
    } else if (audience === 'class' && class_id) {
      recipients = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        schoolId,
        classId: parseInt(class_id, 10),
      });
    } else {
      recipients = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        schoolId,
        studentId: student_id ? parseInt(student_id, 10) : null,
        classId: audience !== 'class' && class_id ? parseInt(class_id, 10) : null,
        parentIds: audience === 'selected' ? parent_ids : null,
      });
    }

    if (!recipients.length) {
      return res.status(400).json({ error: 'No linked parents found for this selection.' });
    }

    const schoolRow = schoolId
      ? await pool.query('SELECT name, district, sector FROM schools WHERE id = $1', [schoolId])
      : { rows: [{}] };
    const schoolMeta = schoolRow.rows[0] || {};

    const contextJson = {
      school_name: schoolMeta.name,
      district: schoolMeta.district,
      sector: schoolMeta.sector,
      notification_type: type || 'announcement',
    };

    let sent = 0;
    let emailed = 0;
    for (const parent of recipients) {
      const studentForParent = student_id
        ? parseInt(student_id, 10)
        : parent.student_id || null;
      let studentName = parent.student_name || null;
      if (!studentName && studentForParent) {
        const sn = await pool.query('SELECT name FROM users WHERE id = $1', [studentForParent]);
        studentName = sn.rows[0]?.name || null;
      }
      const richContext = {
        ...contextJson,
        student_name: studentName,
        student_id: studentForParent,
      };

      await insertParentNotification({
        parentId: parent.id,
        studentId: studentForParent,
        senderId: req.user.id,
        type: type || 'announcement',
        title: messageTitle,
        body: messageBody,
        payload: richContext,
      });

      const chatLine = `📢 ${messageTitle}\n\n${messageBody}`;
      await sendParentInAppMessage({
        senderId: req.user.id,
        parentId: parent.id,
        content: chatLine,
        messageType: type || 'announcement',
        contextJson: richContext,
      });
      const mailResult = await maybeEmailParent({
        parentEmail: parent.email,
        subject: `[UClass] ${messageTitle}`,
        text: `${messageTitle}\n\n${messageBody}\n\n— ${schoolMeta.name || 'School'}`,
        alsoEmail: Boolean(alsoEmail),
      });
      if (mailResult.sent) emailed += 1;
      sent += 1;
    }

    const emailNote = alsoEmail
      ? emailed > 0
        ? ` Email sent to ${emailed} parent(s).`
        : ' (Email not sent — configure SMTP or check parent emails.)'
      : '';
    res.json({ message: `Sent to ${sent} parent(s) in the app.${emailNote}`, count: sent, emailed });
  } catch (err) {
    console.error('[parent notify]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// School announcements
router.get('/school/announcements', authenticateToken, async (req, res) => {
  try {
    let schoolId = await getSenderSchoolId(req.user);
    if (req.user.role === 'parent') {
      const r = await pool.query(
        `SELECT DISTINCT st.school_id FROM parent_children pc
         JOIN users st ON st.id = pc.student_id WHERE pc.parent_id = $1 AND st.school_id IS NOT NULL`,
        [req.user.id]
      );
      const ids = r.rows.map((x) => x.school_id).filter(Boolean);
      if (!ids.length) return res.json([]);
      const ann = await pool.query(
        `SELECT sa.*, u.name AS author_name FROM school_announcements sa
         JOIN users u ON u.id = sa.created_by
         WHERE sa.school_id = ANY($1::int[]) ORDER BY sa.created_at DESC LIMIT 50`,
        [ids]
      );
      return res.json(ann.rows);
    }
    if (!schoolId) return res.json([]);
    const ann = await pool.query(
      `SELECT sa.*, u.name AS author_name FROM school_announcements sa
       JOIN users u ON u.id = sa.created_by
       WHERE sa.school_id = $1
       ORDER BY sa.is_pinned DESC, sa.created_at DESC LIMIT 50`,
      [schoolId]
    );
    res.json(ann.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/school/announcements', authenticateToken, requireRole('head_teacher', 'teacher'), async (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const notifyParents = req.body.notify_parents !== false;
  const alsoEmail = Boolean(req.body.also_email);
  const isPinned = Boolean(req.body.is_pinned);
  if (!title || !body) return res.status(400).json({ error: 'Title and body required.' });

  try {
    const schoolId = await getSenderSchoolId(req.user);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned.' });

    const schoolRow = await pool.query(
      'SELECT name, district, sector, welcome_message FROM schools WHERE id = $1',
      [schoolId]
    );
    const schoolMeta = schoolRow.rows[0] || {};

    const ins = await pool.query(
      `INSERT INTO school_announcements (school_id, created_by, title, body, is_pinned)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [schoolId, req.user.id, title, body, isPinned]
    );

    if (notifyParents) {
      const recipients = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        schoolId,
      });
      const contextJson = {
        school_name: schoolMeta.name,
        district: schoolMeta.district,
        sector: schoolMeta.sector,
        welcome_message: schoolMeta.welcome_message,
      };
      let emailed = 0;
      for (const p of recipients) {
        await insertParentNotification({
          parentId: p.id,
          studentId: p.student_id || null,
          senderId: req.user.id,
          type: 'school_announcement',
          title,
          body,
          payload: { ...contextJson, student_name: p.student_name },
        });
        await sendParentInAppMessage({
          senderId: req.user.id,
          parentId: p.id,
          content: `📢 ${title}\n\n${body}`,
          messageType: 'school_announcement',
          contextJson: { ...contextJson, student_name: p.student_name },
        });
        const mailResult = await maybeEmailParent({
          parentEmail: p.email,
          subject: `[UClass] ${title}`,
          text: `${title}\n\n${body}`,
          alsoEmail,
        });
        if (mailResult.sent) emailed += 1;
      }
      ins.rows[0].parents_notified = recipients.length;
      ins.rows[0].emails_sent = emailed;
    }

    res.status(201).json(ins.rows[0]);
  } catch (err) {
    console.error('[school announcement]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// HT: update school profile (district, sector)
router.put('/school/profile', authenticateToken, requireRole('head_teacher'), async (req, res) => {
  try {
    const schoolId = await getSenderSchoolId(req.user);
    if (!schoolId) return res.status(400).json({ error: 'No school assigned.' });
    const { district, sector, welcome_message } = req.body;
    const result = await pool.query(
      `UPDATE schools SET
         district = COALESCE($1, district),
         sector = COALESCE($2, sector),
         welcome_message = COALESCE($3, welcome_message)
       WHERE id = $4 RETURNING *`,
      [
        district != null ? String(district).trim() : null,
        sector != null ? String(sector).trim() : null,
        welcome_message != null ? String(welcome_message).trim() : null,
        schoolId,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/school/profile', authenticateToken, requireRole('head_teacher', 'teacher', 'parent'), async (req, res) => {
  try {
    let schoolId = await getSenderSchoolId(req.user);
    if (req.user.role === 'parent' && req.query.student_id) {
      const st = await pool.query('SELECT school_id FROM users WHERE id = $1', [req.query.student_id]);
      schoolId = st.rows[0]?.school_id;
    }
    if (!schoolId) return res.status(404).json({ error: 'School not found.' });
    const r = await pool.query('SELECT * FROM schools WHERE id = $1', [schoolId]);
    res.json(r.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// HT: preview / add teacher
router.get('/school/teachers/email-preview', authenticateToken, requireRole('head_teacher'), async (req, res) => {
  const local = normalizeLocalPart(req.query.local);
  const schoolId = await getSenderSchoolId(req.user);
  if (!local) return res.status(400).json({ error: 'Username required.' });
  try {
    const school = await pool.query('SELECT id, name, email_domain FROM schools WHERE id = $1', [schoolId]);
    if (!school.rows.length) return res.status(404).json({ error: 'School not found.' });
    let domain = school.rows[0].email_domain || schoolDomainFromName(school.rows[0].name);
    const email = buildSchoolEmail(local, domain);
    const taken = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    res.json({ email, available: taken.rows.length === 0, email_domain: domain });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/school/teachers', authenticateToken, requireRole('head_teacher'), async (req, res) => {
  try {
    const schoolId = await getSenderSchoolId(req.user);
    const name = (req.body.name || '').trim();
    const local = normalizeLocalPart(req.body.school_email_local || req.body.email_local);
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const school = await pool.query('SELECT id, name, email_domain FROM schools WHERE id = $1', [schoolId]);
    const domain = school.rows[0]?.email_domain || schoolDomainFromName(school.rows[0]?.name);
    const email = local ? buildSchoolEmail(local, domain) : null;

    const created = await createSchoolAccount(req, {
      name,
      email,
      role: 'teacher',
      school_id: schoolId,
      is_approved: true,
    });
    res.status(201).json({
      message: 'Teacher account created. Share the login email and temporary password.',
      ...created,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[add teacher]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
