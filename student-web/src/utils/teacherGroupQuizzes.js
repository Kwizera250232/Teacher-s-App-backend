/** Group assignments keyed by quiz_id for teacher Quizzes tab. */
export function groupAssignmentsByQuiz(assignments) {
  const map = new Map();
  for (const a of assignments || []) {
    if (a?.quiz_id == null) continue;
    const list = map.get(a.quiz_id) || [];
    list.push(a);
    map.set(a.quiz_id, list);
  }
  return map;
}

export function groupAssignmentStatusLabel(a) {
  if (a.status === 'submitted') {
    return { text: `Done ${a.score ?? '?'}/${a.total ?? '?'}`, tone: 'done', emoji: '🏆' };
  }
  if (a.status === 'active' && a.started_by_student_id) {
    return { text: 'In progress', tone: 'active', emoji: '⏳' };
  }
  return { text: 'Released', tone: 'released', emoji: '📤' };
}
