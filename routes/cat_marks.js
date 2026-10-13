const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const { insertParentNotification, resolveParentRecipients } = require('../lib/parentHub');
const { maybeEmailParent } = require('../lib/parentNotifyEmail');
const { getOrCreateParentInviteToken } = require('../lib/parentInvite');
const { resolveFrontendUrl, buildParentInvitePath } = require('../lib/frontendUrl');

const router = express.Router();

pool.query(`
  CREATE TABLE IF NOT EXISTS cat_marks (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    marks_obtained INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    test_date DATE DEFAULT CURRENT_DATE,
    subject TEXT DEFAULT 'General',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, student_id, test_number, subject)
  );
  CREATE INDEX IF NOT EXISTS idx_cat_marks_class ON cat_marks(class_id);
  CREATE INDEX IF NOT EXISTS idx_cat_marks_student ON cat_marks(student_id);
  ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS test_date DATE DEFAULT CURRENT_DATE;
  ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT 'General';
  DROP CONSTRAINT IF EXISTS cat_marks_class_id_student_id_test_number_key;

  CREATE TABLE IF NOT EXISTS cat_totals_config (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    subject TEXT DEFAULT 'General',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, test_number, subject)
  );
`).catch(e => console.error('[cat_marks] migration error:', e.message));

router.get('/:classId/overview', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  const subject = req.query.subject || '';
  try {
    const roster = await pool.query(
      `SELECT u.id AS student_id, u.name
       FROM class_members cm
       JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1
       ORDER BY u.name`,
      [classId]
    );

    // Get marks — optionally filtered by subject
    let marksRows;
    if (subject) {
      marksRows = await pool.query(
        `SELECT student_id, test_number, marks_obtained, total_marks, subject
         FROM cat_marks WHERE class_id = $1 AND subject = $2`,
        [classId, subject]
      );
    } else {
      marksRows = await pool.query(
        `SELECT student_id, test_number, marks_obtained, total_marks, subject
         FROM cat_marks WHERE class_id = $1`,
        [classId]
      );
    }

    // Get list of subjects that have marks
    const subjectsResult = await pool.query(
      `SELECT DISTINCT subject FROM cat_marks WHERE class_id = $1 ORDER BY subject`,
      [classId]
    );

    const marksByStudent = new Map();
    const catTotals = {}; // { test_number: total_marks } — the "out of" for each CAT

    // First, load configured totals from cat_totals_config (teacher-set totals)
    const configRows = await pool.query(
      `SELECT test_number, total_marks FROM cat_totals_config WHERE class_id = $1 AND subject = $2`,
      [classId, subject || 'General']
    );
    for (const row of configRows.rows) {
      catTotals[row.test_number] = Number(row.total_marks) || 100;
    }

    for (const row of marksRows.rows) {
      if (!marksByStudent.has(row.student_id)) marksByStudent.set(row.student_id, {});
      marksByStudent.get(row.student_id)[row.test_number] = {
        marks: Number(row.marks_obtained),
        total: Number(row.total_marks) || catTotals[row.test_number] || 100,
      };
      // Fall back to marks if no config entry
      if (!catTotals[row.test_number]) catTotals[row.test_number] = Number(row.total_marks) || 100;
    }

    const students = roster.rows.map((s) => {
      const tests = marksByStudent.get(s.student_id) || {};
      const cat = {};
      let sumMarks = 0;
      let sumTotal = 0;
      let testCount = 0;
      for (let n = 1; n <= 10; n += 1) {
        if (tests[n]) {
          cat[n] = tests[n].marks;
          sumMarks += tests[n].marks;
          sumTotal += tests[n].total;
          testCount += 1;
        } else {
          cat[n] = null;
        }
      }
      const percentage = sumTotal > 0 ? Math.round((1000 * sumMarks) / sumTotal) / 10 : 0;
      const avg_percentage = testCount > 0
        ? Math.round(
          (Object.values(tests).reduce((acc, t) => acc + (100 * t.marks) / (t.total || 100), 0) / testCount) * 10
        ) / 10
        : 0;
      return {
        student_id: s.student_id,
        name: s.name,
        cat,
        test_count: testCount,
        total_marks: sumMarks,
        percentage,
        avg_percentage,
      };
    });

    const classAvg = await pool.query(
      `SELECT COALESCE(ROUND(AVG(100.0 * marks_obtained / NULLIF(total_marks, 1)), 1), 0) AS avg
       FROM cat_marks WHERE class_id = $1`,
      [classId]
    );

    res.json({
      students,
      class_average: classAvg.rows[0]?.avg || 0,
      subjects: subjectsResult.rows.map(r => r.subject),
      cat_totals: catTotals,
    });
  } catch (err) {
    console.error('[cat_marks] summary error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:classId/student/:studentId', authenticateToken, async (req, res) => {
  const { classId, studentId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM cat_marks WHERE class_id = $1 AND student_id = $2 ORDER BY test_number`,
      [classId, studentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/:classId/entry', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { student_id, test_number, marks_obtained, total_marks, subject } = req.body;
  const classId = req.params.classId;
  if (!student_id || !test_number || marks_obtained === undefined) {
    return res.status(400).json({ error: 'student_id, test_number, marks_obtained required.' });
  }
  const subj = subject || 'General';
  try {
    // If no total_marks provided, look up from config or default to 100
    let finalTotal = total_marks;
    if (!finalTotal) {
      const configRes = await pool.query(
        `SELECT total_marks FROM cat_totals_config WHERE class_id = $1 AND test_number = $2 AND subject = $3`,
        [classId, test_number, subj]
      );
      finalTotal = configRes.rows[0]?.total_marks || 100;
    }
    const result = await pool.query(
      `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks, subject)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (class_id, student_id, test_number, subject)
       DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()
       RETURNING *`,
      [classId, student_id, test_number, marks_obtained, finalTotal, subj]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[cat_marks] save error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Set/change the "out of" (total_marks) for a specific CAT number across all students in a class+subject
router.put('/:classId/cat-total', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { test_number, total_marks, subject } = req.body;
  const classId = req.params.classId;
  if (!test_number || !total_marks || total_marks < 1) {
    return res.status(400).json({ error: 'test_number and total_marks (>=1) required.' });
  }
  const subj = subject || 'General';
  try {
    // Save to config table (persists even if no marks exist yet)
    await pool.query(
      `INSERT INTO cat_totals_config (class_id, test_number, total_marks, subject)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_id, test_number, subject)
       DO UPDATE SET total_marks = $3, updated_at = NOW()`,
      [classId, test_number, total_marks, subj]
    );
    // Also update all existing marks for this CAT
    const result = await pool.query(
      `UPDATE cat_marks SET total_marks = $4, updated_at = NOW()
       WHERE class_id = $1 AND test_number = $2 AND subject = $3`,
      [classId, test_number, subj, total_marks]
    );
    res.json({ updated: result.rowCount, test_number, total_marks, subject: subj });
  } catch (err) {
    console.error('[cat_marks] set-cat-total error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/:classId/fromquiz', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { quiz_id, test_number, subject } = req.body;
  const classId = req.params.classId;
  if (!quiz_id || !test_number) {
    return res.status(400).json({ error: 'quiz_id and test_number required.' });
  }
  const subj = subject || 'General';
  try {
    const attempts = await pool.query(
      `SELECT DISTINCT ON (qa.student_id) qa.student_id, qa.score, qa.total
       FROM quiz_attempts qa
       JOIN class_members cm ON qa.student_id = cm.student_id
       WHERE qa.quiz_id = $1 AND cm.class_id = $2
       ORDER BY qa.student_id, qa.score DESC, qa.attempted_at ASC`,
      [quiz_id, classId]
    );

    for (const att of attempts.rows) {
      await pool.query(
        `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks, subject)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (class_id, student_id, test_number, subject)
         DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()`,
        [classId, att.student_id, test_number, att.score, att.total, subj]
      );
    }

    res.json({ migrated: attempts.rows.length });
  } catch (err) {
    console.error('[cat_marks] from-quiz error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:classId/entry/:markId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM cat_marks WHERE id = $1 AND class_id = $2`,
      [req.params.markId, req.params.classId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:classId/entry/:studentId/:testNumber', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const subject = req.query.subject || 'General';
    await pool.query(
      `DELETE FROM cat_marks WHERE class_id = $1 AND student_id = $2 AND test_number = $3 AND subject = $4`,
      [req.params.classId, req.params.studentId, req.params.testNumber, subject]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /:classId/notify-parents — send the Marks Sheet to every student's parent.
 * In-app notification with the full marks text, plus optional email carrying a
 * downloadable Word (.doc) document containing the teacher CAT table and the
 * class UClass quiz marks for that child only.
 * Body: { also_email?: boolean, subject?: string }
 */
router.post('/:classId/notify-parents', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  const { also_email, subject } = req.body || {};
  const subj = (subject || '').trim();
  try {
    const access = await userCanManageClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Not allowed for this class.' });

    const classInfo = await pool.query(
      `SELECT c.name, c.class_code, s.name AS school_name
       FROM classes c LEFT JOIN schools s ON s.id = c.school_id WHERE c.id = $1`,
      [classId]
    );
    const className = classInfo.rows[0]?.name || '';
    const classCode = classInfo.rows[0]?.class_code || '';
    const schoolName = classInfo.rows[0]?.school_name || '';

    const roster = await pool.query(
      `SELECT u.id AS student_id, u.name, cm.parent_email
       FROM class_members cm JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1 ORDER BY u.name`,
      [classId]
    );

    const marksRes = subj
      ? await pool.query(
          `SELECT student_id, test_number, marks_obtained, total_marks, subject, test_date
           FROM cat_marks WHERE class_id = $1 AND subject = $2 ORDER BY subject, test_number`,
          [classId, subj]
        )
      : await pool.query(
          `SELECT student_id, test_number, marks_obtained, total_marks, subject, test_date
           FROM cat_marks WHERE class_id = $1 ORDER BY subject, test_number`,
          [classId]
        );
    const marksByStudent = {};
    for (const m of marksRes.rows) {
      if (!marksByStudent[m.student_id]) marksByStudent[m.student_id] = [];
      marksByStudent[m.student_id].push(m);
    }

    const quizRes = await pool.query(
      `SELECT qa.student_id, q.title, qa.score, qa.total, qa.attempted_at,
              COALESCE(q.subject, 'General') AS subject
       FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
       WHERE q.class_id = $1 ORDER BY qa.attempted_at DESC`,
      [classId]
    );
    const quizzesByStudent = {};
    for (const q of quizRes.rows) {
      if (!quizzesByStudent[q.student_id]) quizzesByStudent[q.student_id] = [];
      quizzesByStudent[q.student_id].push(q);
    }

    const frontendBase = resolveFrontendUrl(req);
    let notified = 0;
    let emailed = 0;
    let noParent = 0;
    let noMarks = 0;
    let emailFailReason = '';

    for (const s of roster.rows) {
      const marks = marksByStudent[s.student_id] || [];
      const quizzes = (quizzesByStudent[s.student_id] || []).slice(0, 15);
      if (!marks.length && !quizzes.length) { noMarks++; continue; }

      const parents = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        studentId: s.student_id,
      });
      const savedEmail = s.parent_email || '';
      if (!parents.length && !savedEmail) { noParent++; continue; }

      // Group CAT marks by subject
      const bySubj = {};
      for (const m of marks) {
        const key = m.subject || 'General';
        if (!bySubj[key]) bySubj[key] = [];
        bySubj[key].push(m);
      }
      const grandObt = marks.reduce((sum, m) => sum + Number(m.marks_obtained), 0);
      const grandMax = marks.reduce((sum, m) => sum + Number(m.total_marks), 0);
      const grandPct = grandMax ? ((grandObt / grandMax) * 100).toFixed(1) : '0';

      // ---------- Text body (in-app notification) ----------
      const title = `📊 REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI — ${s.name}`;
      let body = `REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI
(Amanota y'umwana wawe yagize mu myitozo yo mu ishuri)
School: ${schoolName}
Student: ${s.name}
Class: ${className}${classCode ? ` (Code: ${classCode})` : ''}
${subj ? `Subject: ${subj}\n` : ''}
MARKS ADDED BY TEACHER (Marks Sheet):`;
      for (const [sname, items] of Object.entries(bySubj)) {
        const tot = items.reduce((a, i) => a + Number(i.marks_obtained), 0);
        const mx = items.reduce((a, i) => a + Number(i.total_marks), 0);
        const pct = mx ? ((tot / mx) * 100).toFixed(0) : '0';
        const detail = items.map(i => `CAT ${i.test_number}: ${i.marks_obtained}/${i.total_marks}`).join(', ');
        body += `\n  ${sname}: ${detail}  → Total: ${tot}/${mx} (${pct}%)`;
      }
      body += `\n  GRAND TOTAL: ${grandObt}/${grandMax} (${grandPct}%)`;
      if (quizzes.length) {
        body += '\n\nUCLASS QUIZ MARKS:';
        for (const q of quizzes) {
          body += `\n  ${q.title} [${q.subject}]: ${q.score}${q.total ? '/' + q.total : '%'}`;
        }
      }

      // ---------- Word document (attachment + same structure as ParentHub download) ----------
      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const docRows = Object.entries(bySubj).map(([sname, items]) => {
        const tot = items.reduce((a, i) => a + Number(i.marks_obtained), 0);
        const mx = items.reduce((a, i) => a + Number(i.total_marks), 0);
        const pct = mx ? ((tot / mx) * 100).toFixed(0) : '0';
        const detail = items.map(i => `CAT ${i.test_number}: ${i.marks_obtained}/${i.total_marks}`).join('<br>');
        return `<tr><td>${esc(sname)}</td><td>${detail}</td><td style="text-align:center">${tot}/${mx}</td><td style="text-align:center">${pct}%</td></tr>`;
      }).join('');
      const quizRows = quizzes.map(q =>
        `<tr><td>${esc(q.title)}</td><td>${esc(q.subject)}</td><td style="text-align:center">${q.score}${q.total ? '/' + q.total : '%'}</td><td style="text-align:center">${q.attempted_at ? new Date(q.attempted_at).toLocaleDateString() : ''}</td></tr>`
      ).join('');
      const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Marks</title></head><body>
<h1 style="color:#075e54">REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI</h1>
<p><b>School:</b> ${esc(schoolName)} &nbsp; <b>Student:</b> ${esc(s.name)} &nbsp; <b>Class:</b> ${esc(className)}${classCode ? ` (${esc(classCode)})` : ''}${subj ? ` &nbsp; <b>Subject:</b> ${esc(subj)}` : ''}</p>
<h2>Marks added by teacher (Marks Sheet)</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">
<tr style="background:#ede9fe"><th>Subject</th><th>CATs</th><th>Total</th><th>%</th></tr>
${docRows || '<tr><td colspan="4">No marks yet</td></tr>'}
<tr style="background:#f1f5f9"><td colspan="2"><b>GRAND TOTAL</b></td><td style="text-align:center"><b>${grandObt}/${grandMax}</b></td><td style="text-align:center"><b>${grandPct}%</b></td></tr>
</table>
${quizRows ? `<h2>UClass quiz marks</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">
<tr style="background:#f0fdf4"><th>Quiz</th><th>Subject</th><th>Score</th><th>Date</th></tr>
${quizRows}
</table>` : ''}
<p style="color:#64748b;font-size:12px">Report sent via UClass by the teacher.</p>
</body></html>`;
      const docName = `AMANOTA-${s.name.replace(/[^a-zA-Z0-9]+/g, '_')}.doc`;
      const attachments = [{ filename: docName, content: Buffer.from(docHtml, 'utf8'), type: 'application/msword' }];

      // ---------- HTML email ----------
      let inviteLink = '';
      try {
        const inviteToken = await getOrCreateParentInviteToken(s.student_id, req.user.id);
        inviteLink = `${frontendBase}${buildParentInvitePath(inviteToken)}`;
      } catch (e) {
        console.error('[cat notify invite]', e.message);
      }
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Tahoma,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:0 0 16px 16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:24px 28px;text-align:center;">
    <div style="font-size:32px;">🎓</div>
    <h1 style="color:#fff;font-size:19px;margin:8px 0 4px;">REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI</h1>
    <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;">${esc(schoolName)} · ${esc(className)}${classCode ? ` · ${esc(classCode)}` : ''}${subj ? ` · ${esc(subj)}` : ''}</p>
    <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:4px 0 0;">Student: <b>${esc(s.name)}</b></p>
  </div>
  <div style="padding:20px 28px 0;">
    <div style="background:#fefce8;border:1px solid #facc15;border-radius:10px;padding:12px 16px;">
      <p style="margin:0;font-size:14px;color:#713f12;font-weight:600;">📎 WORD DOCUMENT ATTACHED — <b>${esc(docName)}</b>. Download it from the attachment above and open it in Word to see the full marks report.</p>
    </div>
  </div>
  <div style="padding:16px 28px;">
    <h3 style="color:#075e54;font-size:15px;margin:0 0 10px;">📝 Marks added by teacher (Marks Sheet)</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#ede9fe;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #c4b5fd;">Subject</th>
        <th style="padding:8px 8px;text-align:left;border-bottom:2px solid #c4b5fd;">CATs</th>
        <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">Total</th>
        <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">%</th>
      </tr></thead>
      <tbody>
        ${Object.entries(bySubj).map(([sname, items]) => {
          const tot = items.reduce((a, i) => a + Number(i.marks_obtained), 0);
          const mx = items.reduce((a, i) => a + Number(i.total_marks), 0);
          const pct = mx ? ((tot / mx) * 100).toFixed(0) : '0';
          const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#b45309' : '#e11d48';
          const detail = items.map(i => `CAT ${i.test_number}: ${i.marks_obtained}/${i.total_marks}`).join(', ');
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">${esc(sname)}</td>
            <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;">${esc(detail)}</td>
            <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;">${tot}/${mx}</td>
            <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;color:${color};">${pct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:14px;background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:14px 18px;text-align:center;">
      <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Grand Total</div>
      <div style="font-size:26px;font-weight:800;color:#fff;">${grandObt}<span style="font-size:15px;color:#94a3b8;">/${grandMax}</span></div>
      <div style="font-size:15px;font-weight:700;color:${grandPct >= 70 ? '#4ade80' : grandPct >= 50 ? '#facc15' : '#f87171'};">${grandPct}%</div>
    </div>
    ${quizzes.length ? `
    <h3 style="color:#075e54;font-size:15px;margin:20px 0 10px;">💻 UClass quiz marks</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f0fdf4;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #bbf7d0;">Quiz</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #bbf7d0;">Score</th>
      </tr></thead>
      <tbody>${quizzes.map(q => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${esc(q.title)} <span style="font-size:11px;color:#7c3aed;">[${esc(q.subject)}]</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${q.score}${q.total ? '/' + q.total : '%'}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''}
    <p style="margin-top:16px;font-size:13px;color:#475569;">📎 The full marks document (<b>${esc(docName)}</b>) is attached to this email — download and open it in Word.</p>
    ${inviteLink ? `<div style="margin-top:16px;text-align:center;"><a href="${inviteLink}" style="display:inline-block;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;">🔐 Sign up to view all progress</a></div>` : ''}
  </div>
  <div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <p style="font-size:12px;color:#64748b;margin:0;text-align:center;">Sent by your child's teacher via UClass. Reply to reach the school.</p>
  </div>
</div></body></html>`;

      // ---------- Deliver ----------
      const emailSubject = `REBA AMANOTA — ${s.name} (${className}${subj ? ' · ' + subj : ''})`;
      for (const p of parents) {
        await insertParentNotification({
          parentId: p.id,
          studentId: s.student_id,
          senderId: req.user.id,
          type: 'marks_sheet',
          title,
          body,
          payload: { classId: Number(classId), studentId: s.student_id, subject: subj || null },
        });
        if (also_email && p.email) {
          const r = await maybeEmailParent({
            parentEmail: p.email, subject: emailSubject, text: body, html,
            alsoEmail: true, attachments,
          });
          if (r.sent) emailed++; else if (!emailFailReason) emailFailReason = r.reason || 'unknown';
        }
      }
      if (also_email && savedEmail) {
        const alreadyEmailed = parents.some(p => p.email === savedEmail);
        if (!alreadyEmailed) {
          const r = await maybeEmailParent({
            parentEmail: savedEmail, subject: emailSubject, text: body, html,
            alsoEmail: true, attachments,
          });
          if (r.sent) emailed++; else if (!emailFailReason) emailFailReason = r.reason || 'unknown';
        }
      }
      notified++;
    }

    let message = `Marks Sheet sent to ${notified} student parent(s). ${emailed} emailed with the Word document.`;
    if (noParent) message += ` ${noParent} student(s) have no linked parent/email.`;
    if (noMarks) message += ` ${noMarks} student(s) had no marks yet (skipped).`;
    if (also_email && emailed === 0 && notified > 0) {
      message += emailFailReason === 'not_configured'
        ? ' Emails not sent: email service not configured on server.'
        : ` Email failed: ${emailFailReason}`;
    }
    res.json({ notified, emailed, no_parent: noParent, no_marks: noMarks, message });
  } catch (err) {
    console.error('[cat_marks] notify-parents error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── MID-TERM REPORT CARD (.doc) — teacher marks only, no UClass quiz marks ──
// POST /:classId/midterm-report { student_id, teacher_comment }
router.post('/:classId/midterm-report', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  const studentId = parseInt(req.body.student_id, 10);
  const teacherComment = String(req.body.teacher_comment || '').trim();
  if (!studentId) return res.status(400).json({ error: 'student_id is required.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage?.ok) return res.status(403).json({ error: 'You cannot generate reports for this class.' });

    const cls = (await pool.query(
      `SELECT c.name AS class_name, c.subject AS class_subject, c.class_code,
              s.name AS school_name
       FROM classes c LEFT JOIN schools s ON s.id = c.school_id
       WHERE c.id = $1`, [classId]
    )).rows[0];
    const student = (await pool.query(
      `SELECT u.id, u.name FROM class_members cm JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND u.id = $2`, [classId, studentId]
    )).rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found in this class.' });
    const teacherName = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0]?.name || 'Teacher';

    const marks = (await pool.query(
      `SELECT subject, test_number, marks_obtained, total_marks
       FROM cat_marks WHERE class_id = $1 AND student_id = $2
       ORDER BY subject, test_number`, [classId, studentId]
    )).rows;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Group marks by subject → per-subject table
    const bySubject = new Map();
    for (const m of marks) {
      const subj = m.subject || 'General';
      if (!bySubject.has(subj)) bySubject.set(subj, []);
      bySubject.get(subj).push(m);
    }

    const gradeFor = (pct) =>
      pct >= 80 ? ['A', 'Excellent'] : pct >= 65 ? ['B', 'Very Good'] : pct >= 50 ? ['C', 'Good'] : pct >= 40 ? ['D', 'Fair'] : ['E', 'Needs Improvement'];

    let grandObtained = 0, grandTotal = 0;
    const subjectBlocks = [...bySubject.entries()].map(([subj, rows]) => {
      const cols = rows.map(r => {
        const t = Number(r.total_marks) || 100;
        const mk = Number(r.marks_obtained);
        grandObtained += mk; grandTotal += t;
        return `<td style="border:1px solid #94a3b8;padding:6px;text-align:center;">${mk}<span style="color:#64748b;font-size:9px;">/${t}</span></td>`;
      }).join('');
      const subjObt = rows.reduce((a, r) => a + Number(r.marks_obtained), 0);
      const subjTot = rows.reduce((a, r) => a + (Number(r.total_marks) || 100), 0);
      const pct = subjTot ? Math.round((subjObt / subjTot) * 1000) / 10 : 0;
      const [g, gLabel] = gradeFor(pct);
      const header = rows.map(r => `<td style="border:1px solid #94a3b8;padding:6px;text-align:center;background:#f1f5f9;font-weight:bold;font-size:10px;">CAT ${r.test_number}</td>`).join('');
      return `
        <h3 style="color:#075e54;margin:16px 0 6px;">${esc(subj)}</h3>
        <table style="border-collapse:collapse;width:100%;">
          <tr><td style="border:1px solid #94a3b8;padding:6px;background:#f1f5f9;font-weight:bold;font-size:10px;">Assessment</td>${header}<td style="border:1px solid #94a3b8;padding:6px;text-align:center;background:#f1f5f9;font-weight:bold;font-size:10px;">%</td><td style="border:1px solid #94a3b8;padding:6px;text-align:center;background:#f1f5f9;font-weight:bold;font-size:10px;">Grade</td></tr>
          <tr><td style="border:1px solid #94a3b8;padding:6px;font-weight:bold;">Marks</td>${cols}<td style="border:1px solid #94a3b8;padding:6px;text-align:center;font-weight:bold;">${pct}%</td><td style="border:1px solid #94a3b8;padding:6px;text-align:center;"><strong>${g}</strong> ${gLabel}</td></tr>
        </table>`;
    }).join('');

    const overallPct = grandTotal ? Math.round((grandObtained / grandTotal) * 1000) / 10 : 0;
    const [oGrade, oLabel] = gradeFor(overallPct);
    const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

    const noMarks = !marks.length ? '<p style="color:#b91c1c;font-weight:bold;">No teacher marks recorded yet for this student.</p>' : '';

    const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:'Times New Roman',Times,serif;font-size:12pt;margin:28px;color:#1e293b;}
      h1{font-size:19pt;text-align:center;color:#075e54;margin:0;}
      .sub{text-align:center;color:#475569;font-size:11pt;margin:4px 0 2px;}
      .meta{width:100%;border-collapse:collapse;margin:14px 0;}
      .meta td{border:1px solid #94a3b8;padding:7px 10px;font-size:11pt;}
      .meta td b{color:#075e54;}
      .overall{border:2px solid #075e54;background:#ecfdf5;padding:10px 14px;margin-top:16px;font-size:12pt;}
      .comment{border:1.5px solid #075e54;padding:12px;margin-top:18px;}
      .sig{margin-top:40px;width:100%;}
      .sig td{padding-top:34px;border-top:none;}
      .sigline{border-top:1px solid #000;width:220px;padding-top:6px;font-size:10pt;color:#475569;}
      .foot{margin-top:22px;font-size:9pt;color:#94a3b8;text-align:center;}
    </style></head><body>
      <h1>${esc(cls?.school_name || 'UClass School')}</h1>
      <p class="sub"><strong>MID-TERM REPORT CARD</strong></p>
      <p class="sub">Academic Year ${new Date().getFullYear()} — Based on class assessments recorded by the teacher</p>
      <table class="meta">
        <tr><td><b>Student Name</b></td><td>${esc(student.name)}</td><td><b>Class</b></td><td>${esc(cls?.class_name || '')}</td></tr>
        <tr><td><b>Class Code</b></td><td>${esc(cls?.class_code || '')}</td><td><b>Report Date</b></td><td>${today}</td></tr>
      </table>
      ${noMarks}
      ${subjectBlocks}
      <div class="overall">
        <strong>OVERALL:</strong> ${grandObtained} / ${grandTotal} marks —
        <strong>Average: ${overallPct}%</strong> —
        Grade <strong>${oGrade}</strong> (${oLabel})
      </div>
      <table style="border-collapse:collapse;margin-top:12px;font-size:10pt;color:#475569;">
        <tr><td style="padding:2px 14px 2px 0;"><b>A</b> ≥ 80 Excellent</td><td style="padding:2px 14px 2px 0;"><b>B</b> 65–79 Very Good</td><td style="padding:2px 14px 2px 0;"><b>C</b> 50–64 Good</td><td style="padding:2px 14px 2px 0;"><b>D</b> 40–49 Fair</td><td style="padding:2px 0;"><b>E</b> &lt; 40 Needs Improvement</td></tr>
      </table>
      <div class="comment">
        <strong>Teacher's Comment:</strong>
        <p style="margin:6px 0 0;min-height:40px;">${teacherComment ? esc(teacherComment).replace(/\n/g, '<br/>') : '<i>No comment added.</i>'}</p>
      </div>
      <table class="sig"><tr>
        <td><div class="sigline"><b>Class Teacher</b><br/>${esc(teacherName)}</div></td>
        <td style="text-align:right;"><div class="sigline" style="margin-left:auto;"><b>Head Teacher / Date</b><br/>&nbsp;</div></td>
      </tr></table>
      <p class="foot">Generated by UClass — ${esc(cls?.school_name || 'UClass School')} · student.umunsi.com</p>
    </body></html>`;

    const safe = String(student.name || 'student').replace(/[^\w]+/g, '-').slice(0, 60);
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="MidTerm-Report-${safe}.doc"`);
    res.send('﻿' + doc);
  } catch (err) {
    console.error('[midterm report]', err.message);
    res.status(500).json({ error: 'Could not build the report right now.' });
  }
});

module.exports = router;
