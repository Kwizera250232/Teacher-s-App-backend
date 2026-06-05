const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const router = express.Router();

const SKILLS = [
  { id: 'on_task', label: 'On task', emoji: '👍' },
  { id: 'participating', label: 'Participating', emoji: '💡' },
  { id: 'persistence', label: 'Persistence', emoji: '🏔️' },
  { id: 'helping', label: 'Helping others', emoji: '🤝' },
  { id: 'working_hard', label: 'Working hard', emoji: '⚡' },
];

function skillMeta(skillId) {
  return SKILLS.find((s) => s.id === skillId) || SKILLS[0];
}

async function classStudentIds(classId) {
  const res = await pool.query(
    'SELECT student_id FROM class_members WHERE class_id = $1',
    [classId]
  );
  return res.rows.map((r) => r.student_id);
}

async function studentPointTotals(classId) {
  const res = await pool.query(
    `SELECT student_id, COALESCE(SUM(value), 0)::int AS points
     FROM class_point_events
     WHERE class_id = $1 AND NOT undone AND student_id IS NOT NULL
     GROUP BY student_id`,
    [classId]
  );
  const map = {};
  for (const row of res.rows) map[row.student_id] = row.points;
  return map;
}

async function fetchRecentEvents(classId, limit = 40) {
  const res = await pool.query(
    `SELECT e.*, u.name AS student_name, t.name AS teacher_name
     FROM class_point_events e
     LEFT JOIN users u ON u.id = e.student_id
     JOIN users t ON t.id = e.teacher_id
     WHERE e.class_id = $1
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [classId, limit]
  );
  return res.rows.map((row) => ({
    ...row,
    skill_meta: skillMeta(row.skill),
  }));
}

function formatEvent(row) {
  return {
    id: row.id,
    student_id: row.student_id,
    student_name: row.student_name,
    teacher_name: row.teacher_name,
    group_id: row.group_id,
    whole_class: row.whole_class,
    value: row.value,
    skill: row.skill,
    skill_meta: skillMeta(row.skill),
    note: row.note,
    undone: row.undone,
    created_at: row.created_at,
  };
}

// GET classroom dashboard (students, groups, points, feed)
router.get('/:classId/classroom', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const [studentsRes, groupsRes, totals, events] = await Promise.all([
      pool.query(
        `SELECT u.id, u.name, cm.joined_at, p.avatar_path
         FROM class_members cm
         JOIN users u ON u.id = cm.student_id
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE cm.class_id = $1
         ORDER BY u.name`,
        [classId]
      ),
      pool.query(
        `SELECT g.id, g.name, g.created_at,
                COALESCE(ARRAY_AGG(gm.student_id) FILTER (WHERE gm.student_id IS NOT NULL), '{}') AS student_ids
         FROM class_groups g
         LEFT JOIN class_group_members gm ON gm.group_id = g.id
         WHERE g.class_id = $1
         GROUP BY g.id
         ORDER BY g.created_at`,
        [classId]
      ),
      studentPointTotals(classId),
      fetchRecentEvents(classId, 30),
    ]);

    const students = studentsRes.rows.map((s) => ({
      ...s,
      points: totals[s.id] || 0,
    }));

    const wholeClassPoints = students.reduce((sum, s) => sum + (s.points || 0), 0);

    const groups = await Promise.all(
      groupsRes.rows.map(async (g) => {
        const memberIds = g.student_ids || [];
        const groupPoints = memberIds.reduce((sum, sid) => sum + (totals[sid] || 0), 0);
        return {
          id: g.id,
          name: g.name,
          student_ids: memberIds,
          points: groupPoints,
          created_at: g.created_at,
        };
      })
    );

    res.json({
      skills: SKILLS,
      students,
      groups,
      whole_class_points: wholeClassPoints,
      recent_events: events.map(formatEvent),
    });
  } catch (err) {
    console.error('[classroom GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST award points
router.post('/:classId/points', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });

  const {
    student_id,
    student_ids,
    group_id,
    whole_class: wholeClass,
    skill = 'on_task',
    value = 1,
    note,
  } = req.body || {};

  const pointValue = parseInt(value, 10);
  if (!Number.isFinite(pointValue) || pointValue < 1 || pointValue > 5) {
    return res.status(400).json({ error: 'Point value must be between 1 and 5.' });
  }
  if (!SKILLS.some((s) => s.id === skill)) {
    return res.status(400).json({ error: 'Invalid skill.' });
  }

  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    let targetIds = [];
    let groupIdNum = null;
    let isWholeClass = Boolean(wholeClass);

    if (student_id) targetIds = [parseInt(student_id, 10)];
    else if (Array.isArray(student_ids) && student_ids.length) {
      targetIds = student_ids.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    } else if (group_id) {
      groupIdNum = parseInt(group_id, 10);
      const gm = await pool.query(
        `SELECT gm.student_id FROM class_group_members gm
         JOIN class_groups g ON g.id = gm.group_id
         WHERE g.id = $1 AND g.class_id = $2`,
        [groupIdNum, classId]
      );
      targetIds = gm.rows.map((r) => r.student_id);
    } else if (isWholeClass) {
      targetIds = await classStudentIds(classId);
    } else {
      return res.status(400).json({ error: 'Specify student_id, student_ids, group_id, or whole_class.' });
    }

    if (!targetIds.length) {
      return res.status(400).json({ error: 'No students to award.' });
    }

    const validMembers = await classStudentIds(classId);
    const validSet = new Set(validMembers);
    targetIds = targetIds.filter((id) => validSet.has(id));
    if (!targetIds.length) {
      return res.status(400).json({ error: 'Selected students are not in this class.' });
    }

    const created = [];
    for (const sid of targetIds) {
      const ins = await pool.query(
        `INSERT INTO class_point_events
           (class_id, teacher_id, student_id, group_id, whole_class, value, skill, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          classId,
          req.user.id,
          sid,
          groupIdNum,
          isWholeClass && !groupIdNum,
          pointValue,
          skill,
          note ? String(note).slice(0, 500) : null,
        ]
      );
      created.push(ins.rows[0].id);
    }

    const events = await pool.query(
      `SELECT e.*, u.name AS student_name, t.name AS teacher_name
       FROM class_point_events e
       LEFT JOIN users u ON u.id = e.student_id
       JOIN users t ON t.id = e.teacher_id
       WHERE e.id = ANY($1::int[])
       ORDER BY e.id`,
      [created]
    );

    res.status(201).json({
      ok: true,
      events: events.rows.map(formatEvent),
    });
  } catch (err) {
    console.error('[points POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE undo a point event
router.delete('/:classId/points/:eventId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const eventId = parseInt(req.params.eventId, 10);
  if (Number.isNaN(classId) || Number.isNaN(eventId)) {
    return res.status(400).json({ error: 'Invalid ID.' });
  }
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const ev = await pool.query(
      'SELECT * FROM class_point_events WHERE id = $1 AND class_id = $2',
      [eventId, classId]
    );
    if (!ev.rows.length) return res.status(404).json({ error: 'Event not found.' });
    if (ev.rows[0].undone) return res.json({ ok: true, already_undone: true });

    await pool.query('UPDATE class_point_events SET undone = TRUE WHERE id = $1', [eventId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[points DELETE]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST reset all class points
router.post('/:classId/points/reset', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    await pool.query(
      'UPDATE class_point_events SET undone = TRUE WHERE class_id = $1 AND NOT undone',
      [classId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[points reset]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET points feed
router.get('/:classId/points/feed', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const events = await fetchRecentEvents(classId, limit);
    res.json(events.map(formatEvent));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create group
router.post('/:classId/groups', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const name = String(req.body?.name || '').trim();
  const studentIds = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  if (!name) return res.status(400).json({ error: 'Group name is required.' });

  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const validMembers = new Set(await classStudentIds(classId));
    const ids = studentIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id) && validMembers.has(id));

    const grp = await pool.query(
      'INSERT INTO class_groups (class_id, name) VALUES ($1, $2) RETURNING *',
      [classId, name.slice(0, 120)]
    );
    const groupId = grp.rows[0].id;
    for (const sid of ids) {
      await pool.query(
        'INSERT INTO class_group_members (group_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [groupId, sid]
      );
    }

    res.status(201).json({
      id: groupId,
      name: grp.rows[0].name,
      student_ids: ids,
      points: 0,
      created_at: grp.rows[0].created_at,
    });
  } catch (err) {
    console.error('[groups POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT update group (name and/or members)
router.put('/:classId/groups/:groupId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const groupId = parseInt(req.params.groupId, 10);
  if (Number.isNaN(classId) || Number.isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid ID.' });
  }

  const name = req.body?.name != null ? String(req.body.name).trim() : null;
  const studentIds = Array.isArray(req.body?.student_ids) ? req.body.student_ids : null;

  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const existing = await pool.query(
      'SELECT id, name FROM class_groups WHERE id = $1 AND class_id = $2',
      [groupId, classId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Group not found.' });

    if (name && name.length) {
      await pool.query('UPDATE class_groups SET name = $1 WHERE id = $2', [name.slice(0, 120), groupId]);
    }

    if (studentIds) {
      const validMembers = new Set(await classStudentIds(classId));
      const ids = studentIds
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id) && validMembers.has(id));

      await pool.query('DELETE FROM class_group_members WHERE group_id = $1', [groupId]);
      for (const sid of ids) {
        await pool.query(
          'INSERT INTO class_group_members (group_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [groupId, sid]
        );
      }
    }

    const updated = await pool.query(
      `SELECT g.id, g.name, g.created_at,
              COALESCE(ARRAY_AGG(gm.student_id) FILTER (WHERE gm.student_id IS NOT NULL), '{}') AS student_ids
       FROM class_groups g
       LEFT JOIN class_group_members gm ON gm.group_id = g.id
       WHERE g.id = $1 AND g.class_id = $2
       GROUP BY g.id`,
      [groupId, classId]
    );
    const row = updated.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      student_ids: row.student_ids || [],
      created_at: row.created_at,
    });
  } catch (err) {
    console.error('[groups PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE group
router.delete('/:classId/groups/:groupId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const groupId = parseInt(req.params.groupId, 10);
  if (Number.isNaN(classId) || Number.isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid ID.' });
  }
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const del = await pool.query(
      'DELETE FROM class_groups WHERE id = $1 AND class_id = $2 RETURNING id',
      [groupId, classId]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Group not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
