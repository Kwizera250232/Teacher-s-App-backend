const pool = require('../db');

/** Group quiz assignments for groups this student belongs to. */
async function fetchStudentGroupAssignments(classId, studentId) {
  const res = await pool.query(
    `SELECT DISTINCT ON (a.id)
            a.id AS assignment_id,
            a.class_id,
            a.group_id,
            a.quiz_id,
            a.status,
            a.started_at,
            a.started_by_student_id,
            a.submitted_at,
            a.submitted_by_student_id,
            a.score,
            a.total,
            a.created_at,
            g.name AS group_name,
            q.title AS quiz_title,
            q.description AS quiz_description,
            q.created_at AS quiz_created_at,
            u.name AS started_by_name,
            su.name AS submitted_by_name
     FROM class_group_quiz_assignments a
     JOIN class_group_members gm ON gm.group_id = a.group_id AND gm.student_id = $2
     JOIN class_groups g ON g.id = a.group_id
     JOIN quizzes q ON q.id = a.quiz_id
     LEFT JOIN users u ON u.id = a.started_by_student_id
     LEFT JOIN users su ON su.id = a.submitted_by_student_id
     WHERE a.class_id = $1
     ORDER BY a.id, a.created_at DESC`,
    [classId, studentId]
  );
  return res.rows;
}

function groupRowToStudentQuiz(row) {
  return {
    id: row.quiz_id,
    title: row.quiz_title,
    description: row.quiz_description,
    created_at: row.quiz_created_at || row.created_at,
    attempt_count: 0,
    is_shared: false,
    is_group_quiz: true,
    group_assignment_id: row.assignment_id,
    group_id: row.group_id,
    group_name: row.group_name,
    status: row.status,
    assignment_status: row.status,
    score: row.score,
    total: row.total,
    started_by_student_id: row.started_by_student_id,
    started_by_name: row.started_by_name,
    submitted_by_name: row.submitted_by_name,
    submitted_at: row.submitted_at,
    class_id: row.class_id,
  };
}

/** One team quiz card per quiz_id (best assignment row wins). */
function dedupeGroupQuizRows(rows) {
  const statusRank = (s) => (s === 'submitted' ? 3 : s === 'active' ? 2 : 1);
  const byQuiz = new Map();
  for (const row of rows) {
    const prev = byQuiz.get(row.quiz_id);
    if (!prev) {
      byQuiz.set(row.quiz_id, row);
      continue;
    }
    if (statusRank(row.status) > statusRank(prev.status)) {
      byQuiz.set(row.quiz_id, row);
    } else if (statusRank(row.status) === statusRank(prev.status)) {
      const rowTs = new Date(row.submitted_at || row.created_at || 0).getTime();
      const prevTs = new Date(prev.submitted_at || prev.created_at || 0).getTime();
      if (rowTs >= prevTs) byQuiz.set(row.quiz_id, row);
    }
  }
  return [...byQuiz.values()];
}

/**
 * Merge class quizzes with team assignment cards.
 * Every class quiz stays on the solo list; team rows are additive for group flow.
 */
function mergeStudentQuizList(soloRows, groupRows) {
  const team = dedupeGroupQuizRows(groupRows).map(groupRowToStudentQuiz);
  const solo = (soloRows || []).map((q) => ({ ...q, is_group_quiz: false }));
  const merged = [...solo, ...team];
  merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return merged;
}

/** Shape for StudentGroupQuizCards from merged quiz row. */
function toGroupAssignmentCard(q) {
  return {
    id: q.group_assignment_id,
    class_id: q.class_id,
    group_id: q.group_id,
    group_name: q.group_name,
    quiz_id: q.id,
    quiz_title: q.title,
    quiz_description: q.description,
    status: q.status,
    score: q.score,
    total: q.total,
    started_by_student_id: q.started_by_student_id,
    started_by_name: q.started_by_name,
    submitted_by_name: q.submitted_by_name,
    created_at: q.created_at,
  };
}

module.exports = {
  fetchStudentGroupAssignments,
  mergeStudentQuizList,
  toGroupAssignmentCard,
};
