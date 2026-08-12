const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const { insertParentNotification, resolveParentRecipients } = require('../lib/parentHub');
const { maybeEmailParent } = require('../lib/parentNotifyEmail');
const { getOrCreateParentInviteToken } = require('../lib/parentInvite');
const { resolveFrontendUrl, buildParentInvitePath } = require('../lib/frontendUrl');
const { analyzeWeaknesses } = require('../lib/weaknessAnalysis');

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
    ALTER TABLE class_members ADD COLUMN IF NOT EXISTS parent_phone TEXT;
    ALTER TABLE weekly_quiz_columns ADD COLUMN IF NOT EXISTS subject TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;
    CREATE TABLE IF NOT EXISTS weekly_student_comments (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES weekly_quiz_reports(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      comment TEXT,
      UNIQUE(report_id, student_id)
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
      `SELECT u.id, u.name, u.email, u.avatar_path, cm.parent_email, cm.parent_phone FROM class_members cm
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

    // Get auto system quiz attempts for students in this class (last 7 days)
    const systemQuizzes = await pool.query(
      `SELECT qa.student_id, q.title, qa.score, qa.total, qa.attempted_at
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       WHERE q.class_id = $1 AND qa.attempted_at >= NOW() - INTERVAL '7 days'
       ORDER BY qa.attempted_at DESC`,
      [classId]
    );

    res.json({
      ...report.rows[0],
      columns: columns.rows,
      students: students.rows,
      marks: marks.rows,
      comments: comments.rows,
      systemQuizzes: systemQuizzes.rows,
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
  const { also_email, student_ids } = req.body;

  try {
    // Get all students in class (optionally filtered to selected student_ids)
    const selectedIds = Array.isArray(student_ids) && student_ids.length
      ? student_ids.map(id => parseInt(id, 10)).filter(id => !Number.isNaN(id))
      : null;

    let studentsQuery, studentsParams;
    if (selectedIds) {
      studentsQuery = `SELECT u.id, u.name, u.avatar_path FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND u.role = 'student' AND u.id = ANY($2) ORDER BY u.name`;
      studentsParams = [classId, selectedIds];
    } else {
      studentsQuery = `SELECT u.id, u.name, u.avatar_path FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND u.role = 'student' ORDER BY u.name`;
      studentsParams = [classId];
    }
    const students = await pool.query(studentsQuery, studentsParams);

    const columns = await pool.query(
      'SELECT * FROM weekly_quiz_columns WHERE report_id = $1 ORDER BY order_num, id',
      [reportId]
    );

    const allMarks = await pool.query(
      `SELECT m.column_id, m.student_id, m.marks FROM weekly_quiz_marks m
       JOIN weekly_quiz_columns c ON c.id = m.column_id WHERE c.report_id = $1`,
      [reportId]
    );

    const className = await pool.query('SELECT name, subject, class_code FROM classes WHERE id = $1', [classId]);
    const weekLabel = await pool.query('SELECT week_label FROM weekly_quiz_reports WHERE id = $1', [reportId]);

    // Get school name
    const schoolInfo = await pool.query(
      `SELECT s.name as school_name FROM schools s
       JOIN classes c ON c.school_id = s.id WHERE c.id = $1`,
      [classId]
    );
    const schoolName = schoolInfo.rows[0]?.school_name || '';

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
    let emailFailReason = '';

    // Get saved parent emails from class_members
    const memberEmails = await pool.query(
      `SELECT student_id, parent_email FROM class_members WHERE class_id = $1 AND parent_email IS NOT NULL AND parent_email <> ''`,
      [classId]
    );
    const emailMap = {};
    for (const r of memberEmails.rows) emailMap[r.student_id] = r.parent_email;

    const frontendBase = resolveFrontendUrl(req);

    for (const s of studentStats) {
      const parents = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        studentId: s.id,
      });

      const savedEmail = emailMap[s.id];

      if (!parents.length && !savedEmail) { noParent++; continue; }

      // Build teacher-added marks summary
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

      // Get system quiz attempts for this student in this class (last 7 days)
      const systemQuizzes = await pool.query(
        `SELECT q.title, qa.score, qa.total, qa.attempted_at
         FROM quiz_attempts qa
         JOIN quizzes q ON q.id = qa.quiz_id
         WHERE q.class_id = $1 AND qa.student_id = $2
           AND qa.attempted_at >= NOW() - INTERVAL '7 days'
         ORDER BY qa.attempted_at DESC LIMIT 10`,
        [classId, s.id]
      );

      // Build parent invite link for this student
      let inviteLink = '';
      try {
        const inviteToken = await getOrCreateParentInviteToken(s.id, req.user.id);
        inviteLink = `${frontendBase}${buildParentInvitePath(inviteToken)}`;
      } catch (e) {
        console.error('[invite token for notify]', e.message);
      }

      const title = `📊 Weekly Quiz Report - ${weekLabel.rows[0]?.week_label || ''}`;
      let body = `UCLASS WEEKLY REPORT
School: ${schoolName}
Student: ${s.name}
Class: ${className.rows[0]?.name || ''}
Class Code: ${className.rows[0]?.class_code || 'N/A'}
Week: ${weekLabel.rows[0]?.week_label || ''}

Rank: ${s.rank} of ${studentStats.length}
Quizzes/CATs taken: ${s.taken}
Total marks: ${s.total}
Average: ${s.avg.toFixed(2)}

Subject Breakdown:
${Object.entries(subjectGroups).map(([subj, g]) => {
  const pct = g.max ? ((g.total / g.max) * 100).toFixed(0) : 0;
  return `  ${subj}: ${g.total}/${g.max} (${pct}%) — ${g.count} CAT(s)`;
}).join('\n')}

Detailed Marks:
${studentMarks}`;

      if (systemQuizzes.rows.length) {
        body += '\n\nSystem Quiz Results:\n';
        body += systemQuizzes.rows.map(sq =>
          `${sq.title}: ${sq.score}${sq.total ? '/' + sq.total : '%'}`
        ).join('\n');
      }

      if (teacherComment) body += `\n\nTeacher's Comment: ${teacherComment}`;

      // Compute weakness analysis (needed for both text and HTML email)
      const quizListForAnalysis = columns.rows.map(c => {
        const m = allMarks.rows.find(mk => mk.column_id === c.id && mk.student_id === s.id);
        return {
          name: c.name,
          subject: c.subject,
          marks: m && m.marks !== null ? parseFloat(m.marks) : null,
          max_marks: parseFloat(c.max_marks),
        };
      });
      const totalMaxForPct = columns.rows.reduce((sum, c) => {
        const m = allMarks.rows.find(mk => mk.column_id === c.id && mk.student_id === s.id);
        return m && m.marks !== null ? sum + parseFloat(c.max_marks) : sum;
      }, 0);
      const pctForAnalysis = totalMaxForPct ? (s.total / totalMaxForPct) * 100 : 0;

      const weakness = analyzeWeaknesses({
        quizzes: quizListForAnalysis,
        average: s.avg,
        percentage: pctForAnalysis,
        rank: s.rank,
        totalStudents: studentStats.length,
      });

      // UCLASS SYSTEM Feedback — per-subject recommendations
      body += '\n\nUCLASS SYSTEM FEEDBACK:\n';
      if (weakness.overallAdvice) body += `${weakness.overallAdvice}\n`;
      if (weakness.adviceList && weakness.adviceList.length) {
        body += weakness.adviceList.map(a => `  ${a.subject} (${a.percentage}%): ${a.advice}`).join('\n');
      }
      if (weakness.strongSubjects && weakness.strongSubjects.length) {
        body += '\nStrong subjects: ' + weakness.strongSubjects.map(st => `${st.subject} (${st.percentage}%)`).join(', ');
      }

      if (inviteLink) body += `\n\nSign up to see full details: ${inviteLink}`;

      // Build HTML email
      const teacherMarksHtml = columns.rows.map(c => {
        const m = allMarks.rows.find(mk => mk.column_id === c.id && mk.student_id === s.id);
        const val = m && m.marks !== null ? parseFloat(m.marks) : null;
        const max = parseFloat(c.max_marks);
        const color = val === null ? '#94a3b8' : (val / max >= 0.5 ? '#16a34a' : '#e11d48');
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${c.subject ? `<span style="font-size:11px;color:#7c3aed;background:#f3e8ff;padding:1px 6px;border-radius:4px;margin-right:4px;">${c.subject}</span>` : ''}${c.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:${color};">${val === null ? 'N/A' : val + '/' + max}</td>
        </tr>`;
      }).join('');

      const systemQuizHtml = systemQuizzes.rows.length ? `
        <div style="margin-top:20px;">
          <h3 style="color:#075e54;font-size:15px;margin:0 0 10px;">💻 System Quiz Results (this week)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f0fdf4;">
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #bbf7d0;">Quiz</th>
                <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #bbf7d0;">Score</th>
              </tr>
            </thead>
            <tbody>
              ${systemQuizzes.rows.map(sq => {
                const pct = sq.total ? (parseFloat(sq.score) / parseFloat(sq.total)) * 100 : parseFloat(sq.score);
                const color = pct >= 50 ? '#16a34a' : '#e11d48';
                return `<tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${sq.title}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:${color};">${sq.score}${sq.total ? '/' + sq.total : '%'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : '';

      const weaknessHtml = (weakness.weakSubjects.length > 0 || weakness.strongSubjects.length > 0 || weakness.overallAdvice) ? `
        <div style="margin-top:20px;">
          <h3 style="color:#075e54;font-size:15px;margin:0 0 10px;">🎯 UCLASS SYSTEM Feedback & Recommendations</h3>

          ${weakness.overallAdvice ? `
          <div style="background:#eff6ff;border-radius:10px;padding:12px 16px;border-left:4px solid #3b82f6;margin-bottom:12px;">
            <div style="font-size:12px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">📊 Overall Assessment</div>
            <div style="font-size:13px;color:#1e293b;line-height:1.6;">${weakness.overallAdvice}</div>
          </div>` : ''}

          ${weakness.weakSubjects.length > 0 ? `
          <div style="background:#fef2f2;border-radius:10px;padding:12px 16px;border-left:4px solid #ef4444;margin-bottom:12px;">
            <div style="font-size:12px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">⚠️ Areas Needing Attention</div>
            ${weakness.adviceList.map(a => `
              <div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #fecaca;">
                <div style="font-size:13px;font-weight:700;color:#991b1b;">${a.subject} — ${a.percentage}%</div>
                <div style="font-size:12px;color:#7f1d1d;line-height:1.5;margin-top:3px;">${a.advice}</div>
              </div>`).join('')}
          </div>` : ''}

          ${weakness.strongSubjects.length > 0 ? `
          <div style="background:#f0fdf4;border-radius:10px;padding:12px 16px;border-left:4px solid #22c55e;">
            <div style="font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">✅ Strong Areas — Keep It Up!</div>
            ${weakness.strongSubjects.map(st => `
              <div style="font-size:13px;color:#166534;margin-bottom:3px;">${st.subject} — ${st.percentage}% 🌟</div>`).join('')}
          </div>` : ''}
        </div>` : '';

      const teacherMsgHtml = teacherComment ? `
        <div style="margin-top:20px;background:#fefce8;border-radius:10px;padding:14px 16px;border-left:4px solid #facc15;">
          <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">✍️ Teacher's Message</div>
          <div style="font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">${teacherComment.replace(/</g, '&lt;')}</div>
        </div>` : '';

      const inviteHtml = inviteLink ? `
        <div style="margin-top:24px;text-align:center;">
          <a href="${inviteLink}" style="display:inline-block;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">🔐 Sign Up to View Full Details</a>
          <p style="color:#64748b;font-size:12px;margin-top:8px;">Use this link to create your parent account and see all of ${s.name}'s progress</p>
        </div>` : '';

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Tahoma,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:0 0 16px 16px;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:24px 28px;text-align:center;">
      <div style="font-size:32px;">🎓</div>
      <h1 style="color:#fff;font-size:20px;margin:8px 0 4px;">UClass Weekly Report</h1>
      ${schoolName ? `<p style="color:rgba(255,255,255,0.95);font-size:14px;margin:0 0 4px;font-weight:600;">🏫 ${schoolName}</p>` : ''}
      <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;">${className.rows[0]?.name || ''} ${className.rows[0]?.class_code ? `· Code: ${className.rows[0].class_code}` : ''}</p>
      <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:4px 0 0;">${weekLabel.rows[0]?.week_label || ''}</p>
    </div>

    <!-- Thank you message -->
    <div style="padding:20px 28px 8px;">
      <p style="font-size:15px;color:#1e293b;line-height:1.6;margin:0;">
        Dear Parent, thank you for choosing our school for <strong>${s.name}</strong>'s education.
        We appreciate your trust and partnership. Here is this week's quiz report:
      </p>
    </div>

    <!-- Stats summary -->
    <div style="padding:12px 28px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <div style="flex:1;background:#eff6ff;border-radius:10px;padding:10px 14px;text-align:center;min-width:80px;">
          <div style="font-size:11px;color:#64748b;">Rank</div>
          <div style="font-size:18px;font-weight:700;color:#92400e;">#${s.rank}<span style="font-size:11px;color:#94a3b8;">/${studentStats.length}</span></div>
        </div>
        <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:10px 14px;text-align:center;min-width:80px;">
          <div style="font-size:11px;color:#64748b;">Quizzes</div>
          <div style="font-size:18px;font-weight:700;color:#16a34a;">${s.taken}</div>
        </div>
        <div style="flex:1;background:#fef3c7;border-radius:10px;padding:10px 14px;text-align:center;min-width:80px;">
          <div style="font-size:11px;color:#64748b;">Average</div>
          <div style="font-size:18px;font-weight:700;color:#1e40af;">${s.avg.toFixed(1)}</div>
        </div>
        <div style="flex:1;background:#fce7f3;border-radius:10px;padding:10px 14px;text-align:center;min-width:80px;">
          <div style="font-size:11px;color:#64748b;">Total</div>
          <div style="font-size:18px;font-weight:700;color:#be185d;">${s.total.toFixed(1)}</div>
        </div>
      </div>
    </div>

    <!-- Teacher-added marks -->
    <div style="padding:16px 28px 8px;">
      <h3 style="color:#075e54;font-size:15px;margin:0 0 10px;">📝 CAT Marks This Week</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Quiz / CAT</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0;">Marks</th>
          </tr>
        </thead>
        <tbody>${teacherMarksHtml}</tbody>
      </table>
    </div>

    <!-- Subject Summary with per-subject average, total, % -->
    ${Object.keys(subjectGroups).length > 0 ? `
    <div style="padding:8px 28px 16px;">
      <h3 style="color:#075e54;font-size:15px;margin:0 0 10px;">📊 Subject Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#ede9fe;">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #c4b5fd;">Subject</th>
            <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">CATs</th>
            <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">Total</th>
            <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">Average</th>
            <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">%</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(subjectGroups).map(([subj, g]) => {
            const pct = g.max ? ((g.total / g.max) * 100).toFixed(0) : 0;
            const avg = g.count ? (g.total / g.count).toFixed(1) : '0';
            const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#facc15' : '#e11d48';
            return `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b;">${subj}</td>
              <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">${g.count}</td>
              <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">${g.total}/${g.max}</td>
              <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">${avg}</td>
              <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;color:${color};">${pct}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${systemQuizHtml}
    ${weaknessHtml}
    ${teacherMsgHtml}
    ${inviteHtml}

    <!-- CEO Quote -->
    <div style="padding:20px 28px;margin-top:8px;">
      <div style="background:linear-gradient(135deg,#f0f4ff 0%,#e0e7ff 100%);border-radius:12px;padding:16px 20px;border:1px solid #c7d2fe;">
        <div style="font-size:24px;margin-bottom:4px;">💡</div>
        <p style="font-size:14px;color:#1e293b;line-height:1.6;font-style:italic;margin:0;">
          "Every child is a seed. With the right soil of love, the water of knowledge, and the sunshine of encouragement, they will grow into mighty trees that shelter generations."
        </p>
        <p style="font-size:12px;color:#6b21a8;font-weight:600;margin:8px 0 0;text-align:right;">— CEO, UClass by Umunsi</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#64748b;margin:0;text-align:center;">
        This report was sent by your child's teacher via UClass.<br>
        Reply to this email to reach the school. We respond quickly.
      </p>
    </div>
  </div>
</body></html>`;

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
            html,
            alsoEmail: true,
          });
          if (emailResult.sent) emailed++;
          else if (!emailFailReason) emailFailReason = emailResult.reason || 'unknown';
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
            html,
            alsoEmail: true,
          });
          if (emailResult.sent) emailed++;
          else if (!emailFailReason) emailFailReason = emailResult.reason || 'unknown';
        }
      }

      notified++;
    }

    let message = `Notified ${notified} parent(s). ${emailed} emailed. ${noParent} student(s) have no linked parent.`;
    if (also_email && emailed === 0 && notified > 0) {
      if (emailFailReason === 'not_configured') {
        message += ' Emails not sent: email service not configured on server. Ask admin to set RESEND_API_KEY or SMTP_* env vars.';
      } else if (emailFailReason) {
        message += ` Email failed: ${emailFailReason}`;
      }
    }

    res.json({
      message,
      notified,
      emailed,
      no_parent: noParent,
      email_fail_reason: emailFailReason || null,
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

// PUT save parent phone for a student in a class
router.put('/:classId/students/:studentId/parent-phone', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const studentId = parseInt(req.params.studentId, 10);
  if (Number.isNaN(classId) || Number.isNaN(studentId)) return res.status(400).json({ error: 'Invalid ID.' });
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
  const phone = (req.body.parent_phone || '').trim();
  try {
    await pool.query(
      'UPDATE class_members SET parent_phone = $1 WHERE class_id = $2 AND student_id = $3',
      [phone || null, classId, studentId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[parent-phone PUT]', err);
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
