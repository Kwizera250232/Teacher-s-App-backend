const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const { notifyGroupQuizReleased } = require('../lib/groupQuizNotify');
const { computeClassGroupStats } = require('../lib/groupStats');
const router = express.Router();

async function studentInGroup(studentId, groupId) {
  const r = await pool.query(
    'SELECT 1 FROM class_group_members WHERE group_id = $1 AND student_id = $2',
    [groupId, studentId]
  );
  return r.rows.length > 0;
}

async function loadAssignment(classId, assignmentId) {
  const r = await pool.query(
    `SELECT a.*, g.name AS group_name, q.title AS quiz_title, q.description AS quiz_description,
            u.name AS started_by_name, su.name AS submitted_by_name
     FROM class_group_quiz_assignments a
     JOIN class_groups g ON g.id = a.group_id
     JOIN quizzes q ON q.id = a.quiz_id
     LEFT JOIN users u ON u.id = a.started_by_student_id
     LEFT JOIN users su ON su.id = a.submitted_by_student_id
     WHERE a.id = $1 AND a.class_id = $2`,
    [assignmentId, classId]
  );
  return r.rows[0] || null;
}

async function groupMembers(groupId) {
  const r = await pool.query(
    `SELECT u.id, u.name
     FROM class_group_members gm
     JOIN users u ON u.id = gm.student_id
     WHERE gm.group_id = $1
     ORDER BY u.name`,
    [groupId]
  );
  return r.rows;
}

function scoreAnswers(questions, answers) {
  let score = 0;
  const results = {};
  for (const q of questions) {
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
      } catch {
        isCorrect = false;
      }
    } else {
      isCorrect = given.toLowerCase() === (correct || '').toLowerCase();
    }
    if (isCorrect) score += 1;
    results[q.id] = { given, correct, isCorrect };
  }
  return { score, total: questions.length, results };
}

function formatAssignment(row, members) {
  if (!row) return null;
  return {
    id: row.id,
    class_id: row.class_id,
    group_id: row.group_id,
    group_name: row.group_name,
    quiz_id: row.quiz_id,
    quiz_title: row.quiz_title,
    quiz_description: row.quiz_description,
    status: row.status,
    started_at: row.started_at,
    started_by_student_id: row.started_by_student_id,
    started_by_name: row.started_by_name,
    submitted_at: row.submitted_at,
    submitted_by_student_id: row.submitted_by_student_id,
    submitted_by_name: row.submitted_by_name,
    score: row.score,
    total: row.total,
    draft_answers: row.draft_answers || {},
    members: members || [],
    created_at: row.created_at,
  };
}

// GET all group quiz assignments for class (teacher)
router.get('/:classId/group-quizzes', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const rows = await pool.query(
      `SELECT a.*, g.name AS group_name, q.title AS quiz_title, q.description AS quiz_description
       FROM class_group_quiz_assignments a
       JOIN class_groups g ON g.id = a.group_id
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.class_id = $1
       ORDER BY a.created_at DESC`,
      [classId]
    );
    res.json(rows.rows.map((r) => formatAssignment(r)));
  } catch (err) {
    console.error('[group-quizzes list]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST assign quiz to one or more groups
router.post('/:classId/group-quizzes', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const quizId = parseInt(req.body?.quiz_id, 10);
  let groupIds = req.body?.group_ids;
  if (!Array.isArray(groupIds) && req.body?.group_id) groupIds = [req.body.group_id];
  if (!Array.isArray(groupIds)) groupIds = [];

  if (!quizId || !groupIds.length) {
    return res.status(400).json({ error: 'quiz_id and group_ids are required.' });
  }

  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const quiz = await pool.query(
      'SELECT id, title FROM quizzes WHERE id = $1 AND class_id = $2',
      [quizId, classId]
    );
    if (!quiz.rows.length) return res.status(404).json({ error: 'Quiz not found in this class.' });
    const quizTitle = quiz.rows[0].title;

    const classRow = await pool.query('SELECT name FROM classes WHERE id = $1', [classId]);
    const className = classRow.rows[0]?.name || '';

    const created = [];
    for (const gid of groupIds) {
      const groupId = parseInt(gid, 10);
      if (Number.isNaN(groupId)) continue;
      const grp = await pool.query(
        'SELECT id, name FROM class_groups WHERE id = $1 AND class_id = $2',
        [groupId, classId]
      );
      if (!grp.rows.length) continue;

      const memberCount = await pool.query(
        'SELECT COUNT(*)::int AS c FROM class_group_members WHERE group_id = $1',
        [groupId]
      );
      if (!memberCount.rows[0]?.c) continue;

      const ins = await pool.query(
        `INSERT INTO class_group_quiz_assignments (class_id, group_id, quiz_id, teacher_id, status, started_at)
         VALUES ($1, $2, $3, $4, 'active', NOW())
         ON CONFLICT (group_id, quiz_id) DO UPDATE SET
           teacher_id = EXCLUDED.teacher_id,
           status = CASE
             WHEN class_group_quiz_assignments.status = 'submitted' THEN class_group_quiz_assignments.status
             ELSE 'active'
           END,
           started_at = COALESCE(class_group_quiz_assignments.started_at, NOW())
         RETURNING id`,
        [classId, groupId, quizId, req.user.id]
      );
      const assignmentId = ins.rows[0].id;
      created.push(assignmentId);

      notifyGroupQuizReleased({
        classId,
        groupId,
        assignmentId,
        quizTitle,
        groupName: grp.rows[0].name,
        className,
      }).catch((e) => console.error('[group-quiz notify]', e.message));
    }

    if (!created.length) {
      return res.status(400).json({ error: 'No valid groups with students selected.' });
    }

    const listed = await pool.query(
      `SELECT a.*, g.name AS group_name, q.title AS quiz_title, q.description AS quiz_description
       FROM class_group_quiz_assignments a
       JOIN class_groups g ON g.id = a.group_id
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.id = ANY($1::int[])`,
      [created]
    );
    res.status(201).json(listed.rows.map((r) => formatAssignment(r)));
  } catch (err) {
    console.error('[group-quizzes assign]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

async function assertStudentInClass(classId, studentId) {
  const member = await pool.query(
    'SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2',
    [classId, studentId]
  );
  return member.rows.length > 0;
}

async function studentGroupsSummary(classId, studentId) {
  const statsMap = await computeClassGroupStats(classId);
  const groupsRes = await pool.query(
    `SELECT g.id, g.name, g.created_at
     FROM class_groups g
     JOIN class_group_members gm ON gm.group_id = g.id AND gm.student_id = $2
     WHERE g.class_id = $1
     ORDER BY g.name, g.created_at`,
    [classId, studentId]
  );

  const out = [];
  for (const g of groupsRes.rows) {
    const members = await groupMembers(g.id);
    const st = statsMap[g.id] || {};
    const assignCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM class_group_quiz_assignments
       WHERE class_id = $1 AND group_id = $2`,
      [classId, g.id]
    );
    out.push({
      id: g.id,
      name: g.name,
      created_at: g.created_at,
      members,
      member_count: members.length,
      points: st.points || 0,
      points_rank: st.points_rank,
      quiz_marks: st.quiz_marks || 0,
      quiz_marks_total: st.quiz_marks_total || 0,
      quiz_rank: st.quiz_rank,
      total_groups: st.total_groups || 0,
      assignment_count: assignCount.rows[0]?.c || 0,
      pending_count: st.quizzes_pending || 0,
    });
  }
  return out;
}

async function studentGroupDetail(classId, studentId, groupId) {
  const inGroup = await studentInGroup(studentId, groupId);
  if (!inGroup) return null;

  const grp = await pool.query(
    'SELECT id, name, created_at FROM class_groups WHERE id = $1 AND class_id = $2',
    [groupId, classId]
  );
  if (!grp.rows.length) return null;

  const members = await groupMembers(groupId);
  const statsMap = await computeClassGroupStats(classId);
  const st = statsMap[groupId] || {};

  const assignRes = await pool.query(
    `SELECT a.*, g.name AS group_name, q.title AS quiz_title, q.description AS quiz_description,
            u.name AS started_by_name, su.name AS submitted_by_name
     FROM class_group_quiz_assignments a
     JOIN class_groups g ON g.id = a.group_id
     JOIN quizzes q ON q.id = a.quiz_id
     LEFT JOIN users u ON u.id = a.started_by_student_id
     LEFT JOIN users su ON u.id = a.submitted_by_student_id
     WHERE a.class_id = $1 AND a.group_id = $2
     ORDER BY a.created_at DESC`,
    [classId, groupId]
  );

  return {
    id: grp.rows[0].id,
    name: grp.rows[0].name,
    created_at: grp.rows[0].created_at,
    members,
    points: st.points || 0,
    points_rank: st.points_rank,
    quiz_marks: st.quiz_marks || 0,
    quiz_marks_total: st.quiz_marks_total || 0,
    quiz_rank: st.quiz_rank,
    total_groups: st.total_groups || 0,
    assignments: assignRes.rows.map((row) => formatAssignment(row, members)),
  };
}

// GET student's groups in this class (with quiz work inside each group)
router.get('/:classId/my-groups', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  try {
    if (!(await assertStudentInClass(classId, req.user.id))) {
      return res.status(403).json({ error: 'Not in this class.' });
    }
    res.json(await studentGroupsSummary(classId, req.user.id));
  } catch (err) {
    console.error('[my-groups]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET one group (assignments only visible after opening the group)
router.get('/:classId/my-groups/:groupId', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const groupId = parseInt(req.params.groupId, 10);
  try {
    if (!(await assertStudentInClass(classId, req.user.id))) {
      return res.status(403).json({ error: 'Not in this class.' });
    }
    const detail = await studentGroupDetail(classId, req.user.id, groupId);
    if (!detail) return res.status(404).json({ error: 'Group not found.' });
    res.json(detail);
  } catch (err) {
    console.error('[my-groups/detail]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET student's group quiz assignments in this class (flat list — legacy)
router.get('/:classId/my-group-quizzes', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  try {
    if (!(await assertStudentInClass(classId, req.user.id))) {
      return res.status(403).json({ error: 'Not in this class.' });
    }
    const groups = await studentGroupsSummary(classId, req.user.id);
    const flat = [];
    for (const g of groups) {
      const detail = await studentGroupDetail(classId, req.user.id, g.id);
      for (const a of detail?.assignments || []) flat.push(a);
    }
    res.json(flat);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET single assignment detail
router.get('/:classId/group-quizzes/:assignmentId', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const assignmentId = parseInt(req.params.assignmentId, 10);
  try {
    const row = await loadAssignment(classId, assignmentId);
    if (!row) return res.status(404).json({ error: 'Assignment not found.' });

    const members = await groupMembers(row.group_id);
    const isTeacher = ['teacher', 'head_teacher'].includes(req.user.role);
    if (!isTeacher) {
      const inGroup = await studentInGroup(req.user.id, row.group_id);
      if (!inGroup) return res.status(403).json({ error: 'You are not in this group.' });
    }

    res.json(formatAssignment(row, members));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST start group work (any group member)
router.post('/:classId/group-quizzes/:assignmentId/start', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const assignmentId = parseInt(req.params.assignmentId, 10);
  try {
    const row = await loadAssignment(classId, assignmentId);
    if (!row) return res.status(404).json({ error: 'Assignment not found.' });
    if (row.status === 'submitted') {
      return res.status(409).json({ error: 'This group quiz is already submitted.' });
    }
    const inGroup = await studentInGroup(req.user.id, row.group_id);
    if (!inGroup) return res.status(403).json({ error: 'You are not in this group.' });

    await pool.query(
      `UPDATE class_group_quiz_assignments
       SET status = 'active',
           started_at = COALESCE(started_at, NOW()),
           started_by_student_id = COALESCE(started_by_student_id, $3)
       WHERE id = $1 AND class_id = $2`,
      [assignmentId, classId, req.user.id]
    );
    const updated = await loadAssignment(classId, assignmentId);
    const members = await groupMembers(updated.group_id);
    res.json(formatAssignment(updated, members));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT save draft answers (collaborative)
router.put('/:classId/group-quizzes/:assignmentId/answers', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const { answers } = req.body || {};
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'answers object is required.' });
  }
  try {
    const row = await loadAssignment(classId, assignmentId);
    if (!row) return res.status(404).json({ error: 'Assignment not found.' });
    if (row.status === 'submitted') return res.status(409).json({ error: 'Already submitted.' });
    const inGroup = await studentInGroup(req.user.id, row.group_id);
    if (!inGroup) return res.status(403).json({ error: 'You are not in this group.' });

    const merged = { ...(row.draft_answers || {}), ...answers };
    await pool.query(
      `UPDATE class_group_quiz_assignments
       SET draft_answers = $3::jsonb,
           status = CASE WHEN status = 'assigned' THEN 'active' ELSE status END,
           started_at = COALESCE(started_at, NOW()),
           started_by_student_id = COALESCE(started_by_student_id, $4)
       WHERE id = $1 AND class_id = $2`,
      [assignmentId, classId, JSON.stringify(merged), req.user.id]
    );
    res.json({ ok: true, draft_answers: merged });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST submit group quiz
router.post('/:classId/group-quizzes/:assignmentId/submit', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const { answers } = req.body || {};
  try {
    const row = await loadAssignment(classId, assignmentId);
    if (!row) return res.status(404).json({ error: 'Assignment not found.' });
    if (row.status === 'submitted') return res.status(409).json({ error: 'Already submitted.' });
    const inGroup = await studentInGroup(req.user.id, row.group_id);
    if (!inGroup) return res.status(403).json({ error: 'You are not in this group.' });

    const finalAnswers = answers && typeof answers === 'object'
      ? answers
      : (row.draft_answers || {});

    const questions = await pool.query(
      'SELECT id, correct_answer, question_type, passage FROM quiz_questions WHERE quiz_id = $1',
      [row.quiz_id]
    );
    const { score, total, results } = scoreAnswers(questions.rows, finalAnswers);

    const members = await groupMembers(row.group_id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE class_group_quiz_assignments
         SET status = 'submitted',
             submitted_at = NOW(),
             submitted_by_student_id = $3,
             score = $4,
             total = $5,
             final_answers = $6::jsonb,
             draft_answers = $6::jsonb
         WHERE id = $1 AND class_id = $2`,
        [assignmentId, classId, req.user.id, score, total, JSON.stringify(finalAnswers)]
      );

      for (const m of members) {
        const exists = await client.query(
          'SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2',
          [row.quiz_id, m.id]
        );
        if (!exists.rows.length) {
          await client.query(
            `INSERT INTO quiz_attempts (quiz_id, student_id, score, total, answers, group_assignment_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [row.quiz_id, m.id, score, total, JSON.stringify(finalAnswers), assignmentId]
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ score, total, results, group_name: row.group_name, members: members.map((m) => m.name) });
  } catch (err) {
    console.error('[group-quiz submit]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
