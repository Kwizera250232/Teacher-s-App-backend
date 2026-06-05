const pool = require('../db');

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

/** Behavior points, quiz marks, and ranks for every group in a class. */
async function computeClassGroupStats(classId) {
  const totals = await studentPointTotals(classId);

  const groupsRes = await pool.query(
    `SELECT g.id, g.name,
            COALESCE(ARRAY_AGG(gm.student_id) FILTER (WHERE gm.student_id IS NOT NULL), '{}') AS student_ids
     FROM class_groups g
     LEFT JOIN class_group_members gm ON gm.group_id = g.id
     WHERE g.class_id = $1
     GROUP BY g.id
     ORDER BY g.name, g.created_at`,
    [classId]
  );

  const quizRes = await pool.query(
    `SELECT group_id,
            COALESCE(SUM(score) FILTER (WHERE status = 'submitted'), 0)::int AS quiz_marks,
            COALESCE(SUM(total) FILTER (WHERE status = 'submitted'), 0)::int AS quiz_marks_total,
            COUNT(*) FILTER (WHERE status = 'submitted')::int AS quizzes_submitted,
            COUNT(*) FILTER (WHERE status <> 'submitted')::int AS quizzes_pending
     FROM class_group_quiz_assignments
     WHERE class_id = $1
     GROUP BY group_id`,
    [classId]
  );
  const quizByGroup = {};
  for (const row of quizRes.rows) quizByGroup[row.group_id] = row;

  const groups = groupsRes.rows.map((g) => {
    const memberIds = g.student_ids || [];
    const points = memberIds.reduce((sum, sid) => sum + (totals[sid] || 0), 0);
    const qz = quizByGroup[g.id] || {};
    return {
      id: g.id,
      name: g.name,
      student_ids: memberIds,
      points,
      quiz_marks: qz.quiz_marks || 0,
      quiz_marks_total: qz.quiz_marks_total || 0,
      quizzes_submitted: qz.quizzes_submitted || 0,
      quizzes_pending: qz.quizzes_pending || 0,
    };
  });

  const totalGroups = groups.length;
  const byPoints = [...groups].sort((a, b) => b.points - a.points || a.id - b.id);
  const byQuiz = [...groups].sort(
    (a, b) => b.quiz_marks - a.quiz_marks || b.quiz_marks_total - a.quiz_marks_total || a.id - b.id
  );

  const pointsRank = {};
  const quizRank = {};
  byPoints.forEach((g, i) => {
    pointsRank[g.id] = i + 1;
  });
  byQuiz.forEach((g, i) => {
    quizRank[g.id] = i + 1;
  });

  const map = {};
  for (const g of groups) {
    map[g.id] = {
      ...g,
      points_rank: totalGroups ? pointsRank[g.id] : null,
      quiz_rank: totalGroups ? quizRank[g.id] : null,
      total_groups: totalGroups,
    };
  }
  return map;
}

module.exports = { computeClassGroupStats, studentPointTotals };
