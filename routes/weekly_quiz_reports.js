const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const { insertParentNotification, resolveParentRecipients } = require('../lib/parentHub');
const { maybeEmailParent } = require('../lib/parentNotifyEmail');

const router = express.Router();

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weekly_quiz_reports (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_label VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(class_id, week_label)
    );
    CREATE TABLE IF NOT EXISTS weekly_quiz_columns (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES weekly_quiz_reports(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      max_marks NUMERIC(6,2) DEFAULT 20,
      order_num INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS weekly_quiz_marks (
      id SERIAL PRIMARY KEY,
      column_id INTEGER NOT NULL REFERENCES weekly_quiz_columns(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      marks NUMERIC(6,2),
      UNIQUE(column_id, student_id)
    );
  `);
}

ensureSchema().catch(e => console.error('[weekly_quiz_reports] schema:', e.message));

// GET all reports for a class
router.get('/:classId/weekly-reports', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  try {
    const reports = await pool.query(
      `SELECT * FROM weekly_quiz_reports WHERE class_id = $1 ORDER BY created_at DESC`,
      [classId]
    );
    res.json(reports.rows);
  } catch (err) {
    console.error('[weekly-reports GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET a single report with columns, marks, and students
router.get('/:classId/weekly-reports/:reportId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const reportId = parseInt(req.params.reportId, 10);
  if (Number.isNaN(classId) || Number.isNaN(reportId)) return res.status(400).json({ error: 'Invalid ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  try {
    const report = await pool.query('SELECT * FROM weekly_quiz_reports WHERE id = $1 AND class_id = $2', [reportId, classId]);
    if (!report.rows.length) return res.status(404).json({ error: 'Report not found.' });

    const columns = await pool.query(
      'SELECT * FROM weekly_quiz_columns WHERE report_id = $1 ORDER BY order_num, id',
      [reportId]
    );

    const students = await pool.query(
      `SELECT u.id, u.name, u.email, cm.parent_email FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND u.role = 'student'
       ORDER BY u.name`,
      [classId]
    );

    const marks = await pool.query(
      `SELECT m.column_id, m.student_id, m.marks FROM weekly_quiz_marks m
       JOIN weekly_quiz_columns c ON c.id = m.column_id
       WHERE c.report_id = $1`,
      [reportId]
    );

    const comments = await pool.query(
      'SELECT student_id, comment FROM weekly_student_comments WHERE report_id = $1',
      [reportId]
    );

    res.json({
      ...report.rows[0],
      columns: columns.rows,
      students: students.rows,
      marks: marks.rows,
      comments: comments.rows,
    });
  } catch (err) {
    console.error('[weekly-report GET one]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create a new weekly report
router.post('/:classId/weekly-reports', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const weekLabel = (req.body.week_label || '').trim();
  if (!weekLabel) return res.status(400).json({ error: 'Week label is required.' });
  try {
    const existing = await pool.query(
      'SELECT id FROM weekly_quiz_reports WHERE class_id = $1 AND week_label = $2',
      [classId, weekLabel]
    );
    if (existing.rows.length) return res.json(existing.rows[0]);

    const result = await pool.query(
      'INSERT INTO weekly_quiz_reports (class_id, teacher_id, week_label) VALUES ($1,$2,$3) RETURNING *',
      [classId, req.user.id, weekLabel]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[weekly-report POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST add a column to a report
router.post('/:classId/weekly-reports/:reportId/columns', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const reportId = parseInt(req.params.reportId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const name = (req.body.name || '').trim();
  const maxMarks = parseFloat(req.body.max_marks) || 20;
  const subject = (req.body.subject || '').trim();
  if (!name) return res.status(400).json({ error: 'Column name is required.' });
  try {
    const orderResult = await pool.query('SELECT COALESCE(MAX(order_num), -1) + 1 AS next_order FROM weekly_quiz_columns WHERE report_id = $1', [reportId]);
    const result = await pool.query(
      'INSERT INTO weekly_quiz_columns (report_id, name, max_marks, order_num, subject) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [reportId, name, maxMarks, orderResult.rows[0].next_order, subject || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[weekly-report column POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT update column name/max
router.put('/:classId/weekly-reports/:reportId/columns/:columnId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const columnId = parseInt(req.params.columnId, 10);
  const name = (req.body.name || '').trim();
  const maxMarks = parseFloat(req.body.max_marks);
  try {
    const result = await pool.query(
      'UPDATE weekly_quiz_columns SET name = COALESCE($1, name), max_marks = COALESCE($2, max_marks), subject = COALESCE($3, subject) WHERE id = $4 RETURNING *',
      [name || null, isNaN(maxMarks) ? null : maxMarks, (req.body.subject || '').trim() || null, columnId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE a column
router.delete('/:classId/weekly-reports/:reportId/columns/:columnId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const columnId = parseInt(req.params.columnId, 10);
  try {
    await pool.query('DELETE FROM weekly_quiz_columns WHERE id = $1', [columnId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT auto-save marks (batch)
router.put('/:classId/weekly-reports/:reportId/marks', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const { marks } = req.body; // [{ column_id, student_id, marks }]
  if (!Array.isArray(marks)) return res.status(400).json({ error: 'Marks array required.' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const m of marks) {
        const val = m.marks === '' || m.marks === null || m.marks === undefined ? null : parseFloat(m.marks);
        await client.query(
          `INSERT INTO weekly_quiz_marks (column_id, student_id, marks)
           VALUES ($1,$2,$3)
           ON CONFLICT (column_id, student_id) DO UPDATE SET marks = $3`,
          [m.column_id, m.student_id, isNaN(val) ? null : val]
        );
      }
      await client.query('UPDATE weekly_quiz_reports SET updated_at = NOW() WHERE id = $1', [parseInt(req.params.reportId, 10)]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[weekly-report marks PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST generate AI report for a student
router.post('/:classId/weekly-reports/:reportId/ai-report', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const reportId = parseInt(req.params.reportId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id is required.' });

  try {
    // Gather student marks
    const student = await pool.query('SELECT name FROM users WHERE id = $1', [student_id]);
    if (!student.rows.length) return res.status(404).json({ error: 'Student not found.' });

    const columns = await pool.query(
      `SELECT c.id, c.name, c.max_marks, m.marks FROM weekly_quiz_columns c
       LEFT JOIN weekly_quiz_marks m ON m.column_id = c.id AND m.student_id = $1
       WHERE c.report_id = $2 ORDER BY c.order_num, c.id`,
      [student_id, reportId]
    );

    const className = await pool.query('SELECT name, subject FROM classes WHERE id = $1', [classId]);

    // Build marks summary
    const quizData = columns.rows.map(c => ({
      quiz: c.name,
      marks: c.marks !== null ? parseFloat(c.marks) : null,
      max: parseFloat(c.max_marks),
    }));

    const taken = quizData.filter(q => q.marks !== null);
    const totalMarks = taken.reduce((s, q) => s + q.marks, 0);
    const totalMax = taken.reduce((s, q) => s + q.max, 0);
    const avg = taken.length ? (totalMarks / taken.length).toFixed(2) : 0;
    const pct = totalMax ? ((totalMarks / totalMax) * 100).toFixed(1) : 0;

    // Call Gemini AI
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return basic report without AI
      return res.json({
        student_name: student.rows[0].name,
        class_name: className.rows[0]?.name || '',
        quiz_count: taken.length,
        total_marks: totalMarks,
        average: parseFloat(avg),
        percentage: parseFloat(pct),
        ai_feedback: null,
        summary: `Total: ${totalMarks}/${totalMax}, Average: ${avg}, Percentage: ${pct}%`,
      });
    }

    const marksText = quizData.map(q =>
      `${q.quiz}: ${q.marks !== null ? q.marks + '/' + q.max : 'Not taken'}`
    ).join(', ');

    const prompt = `You are an educational analyst. Analyze this student's weekly quiz performance and generate a report.

Student: ${student.rows[0].name}
Class: ${className.rows[0]?.name || ''} (${className.rows[0]?.subject || ''})
Quizzes: ${marksText}
Total: ${totalMarks}/${totalMax}, Average: ${avg}, Percentage: ${pct}%

Generate a JSON response with these exact fields:
{
  "performed_well": "List quizzes/topics where student performed well (marks >= 50%)",
  "needs_improvement": "List quizzes/topics where student needs improvement (marks < 50%)",
  "appreciation": "A positive note about the student's effort or achievement",
  "suggestions_for_parents": "2-3 actionable suggestions for parents to help the student improve"
}

Respond ONLY with valid JSON, no markdown.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
      }),
    });

    let aiFeedback = null;
    if (aiRes.ok) {
      const data = await aiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      try {
        aiFeedback = JSON.parse(text.replace(/```json|```/g, '').trim());
      } catch {
        aiFeedback = { raw_text: text };
      }
    }

    res.json({
      student_name: student.rows[0].name,
      class_name: className.rows[0]?.name || '',
      quiz_count: taken.length,
      total_marks: totalMarks,
      average: parseFloat(avg),
      percentage: parseFloat(pct),
      ai_feedback: aiFeedback,
      summary: `Total: ${totalMarks}/${totalMax}, Average: ${avg}, Percentage: ${pct}%`,
    });
  } catch (err) {
    console.error('[weekly-report AI]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST notify parents with weekly report
router.post('/:classId/weekly-reports/:reportId/notify-parents', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const reportId = parseInt(req.params.reportId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const { also_email } = req.body;

  try {
    // Get all students in class
    const students = await pool.query(
      `SELECT u.id, u.name FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND u.role = 'student' ORDER BY u.name`,
      [classId]
    );

    const columns = await pool.query(
      'SELECT * FROM weekly_quiz_columns WHERE report_id = $1 ORDER BY order_num, id',
      [reportId]
    );

    const allMarks = await pool.query(
      `SELECT m.column_id, m.student_id, m.marks FROM weekly_quiz_marks m
       JOIN weekly_quiz_columns c ON c.id = m.column_id WHERE c.report_id = $1`,
      [reportId]
    );

    const className = await pool.query('SELECT name, subject FROM classes WHERE id = $1', [classId]);
    const weekLabel = await pool.query('SELECT week_label FROM weekly_quiz_reports WHERE id = $1', [reportId]);

    // Calculate rankings
    const studentStats = students.rows.map(s => {
      const marks = allMarks.rows.filter(m => m.student_id === s.id && m.marks !== null);
      const total = marks.reduce((sum, m) => sum + parseFloat(m.marks), 0);
      const taken = marks.length;
      const avg = taken ? total / taken : 0;
      return { ...s, total, taken, avg };
    });
    studentStats.sort((a, b) => b.total - a.total);
    studentStats.forEach((s, i) => { s.rank = i + 1; });

    let notified = 0;
    let emailed = 0;
    let noParent = 0;

    // Get saved parent emails from class_members
    const memberEmails = await pool.query(
      `SELECT student_id, parent_email FROM class_members WHERE class_id = $1 AND parent_email IS NOT NULL AND parent_email <> ''`,
      [classId]
    );
    const emailMap = {};
    for (const r of memberEmails.rows) emailMap[r.student_id] = r.parent_email;

    for (const s of studentStats) {
      const parents = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        studentId: s.id,
      });

      const savedEmail = emailMap[s.id];

      if (!parents.length && !savedEmail) { noParent++; continue; }

      const studentMarks = columns.rows.map(c => {
        const m = allMarks.rows.find(mk => mk.column_id === c.id && mk.student_id === s.id);
        const subj = c.subject ? `[${c.subject}] ` : '';
        return `${subj}${c.name}: ${m && m.marks !== null ? m.marks + '/' + c.max_marks : 'N/A'}`;
      }).join('\n');

      // Group by subject for analytics
      const subjectGroups = {};
      for (const c of columns.rows) {
        const subj = c.subject || 'General';
        if (!subjectGroups[subj]) subjectGroups[subj] = { total: 0, max: 0, count: 0 };
        const m = allMarks.rows.find(mk => mk.column_id === c.id && mk.student_id === s.id);
        if (m && m.marks !== null) {
          subjectGroups[subj].total += parseFloat(m.marks);
          subjectGroups[subj].max += parseFloat(c.max_marks);
          subjectGroups[subj].count++;
        }
      }
      const subjectSummary = Object.entries(subjectGroups).map(([subj, g]) => {
        const pct = g.max ? ((g.total / g.max) * 100).toFixed(0) : 0;
        return `${subj}: ${g.total}/${g.max} (${pct}%)`;
      }).join(', ');

      // Get teacher comment
      const commentRow = await pool.query(
        'SELECT comment FROM weekly_student_comments WHERE report_id = $1 AND student_id = $2',
        [reportId, s.id]
      );
      const teacherComment = commentRow.rows[0]?.comment || '';

      const title = `📊 Weekly Quiz Report - ${weekLabel.rows[0]?.week_label || ''}`;
      let body = `${s.name}'s report for ${className.rows[0]?.name || ''}:
Rank: ${s.rank} of ${studentStats.length}
Quizzes taken: ${s.taken}
Total marks: ${s.total}
Average: ${s.avg.toFixed(2)}

${studentMarks}

By Subject: ${subjectSummary}`;
      if (teacherComment) body += `\n\nTeacher's Comment: ${teacherComment}`;

      // Send in-app notification to linked parent users
      for (const p of parents) {
        await insertParentNotification({
          parentId: p.id,
          studentId: s.id,
          senderId: req.user.id,
          type: 'weekly_digest',
          title,
          body,
          payload: { reportId, classId, studentId: s.id, rank: s.rank, total: s.total },
        });

        if (also_email && p.email) {
          const emailResult = await maybeEmailParent({
            parentEmail: p.email,
            subject: title,
            text: body,
            alsoEmail: true,
          });
          if (emailResult.sent) emailed++;
        }
      }

      // Also email the saved parent_email if no linked parent got emailed
      if (also_email && savedEmail) {
        const alreadyEmailed = parents.some(p => p.email === savedEmail);
        if (!alreadyEmailed) {
          const emailResult = await maybeEmailParent({
            parentEmail: savedEmail,
            subject: title,
            text: body,
            alsoEmail: true,
          });
          if (emailResult.sent) emailed++;
        }
      }

      notified++;
    }

    res.json({
      message: `Notified ${notified} parent(s). ${emailed} emailed. ${noParent} student(s) have no linked parent.`,
      notified,
      emailed,
      no_parent: noParent,
    });
  } catch (err) {
    console.error('[weekly-report notify]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT save parent email for a student in a class
router.put('/:classId/students/:studentId/parent-email', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const studentId = parseInt(req.params.studentId, 10);
  if (Number.isNaN(classId) || Number.isNaN(studentId)) return res.status(400).json({ error: 'Invalid ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const email = (req.body.parent_email || '').trim();
  try {
    await pool.query(
      'UPDATE class_members SET parent_email = $1 WHERE class_id = $2 AND student_id = $3',
      [email || null, classId, studentId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[parent-email PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT save teacher comment for a student in a report
router.put('/:classId/weekly-reports/:reportId/comments/:studentId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const reportId = parseInt(req.params.reportId, 10);
  const studentId = parseInt(req.params.studentId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const comment = (req.body.comment || '').trim();
  try {
    await pool.query(
      `INSERT INTO weekly_student_comments (report_id, student_id, comment)
       VALUES ($1,$2,$3)
       ON CONFLICT (report_id, student_id) DO UPDATE SET comment = $3`,
      [reportId, studentId, comment]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[comment PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
