/** One card per quiz in a team room (not per duplicate DB/join row). */
export function uniqueGroupAssignments(list) {
  const statusRank = (s) => (s === 'submitted' ? 3 : s === 'active' ? 2 : 1);
  const byQuiz = new Map();
  for (const a of list || []) {
    if (!a?.id) continue;
    const key = a.quiz_id != null ? `q${a.quiz_id}` : `a${a.id}`;
    const prev = byQuiz.get(key);
    if (!prev) {
      byQuiz.set(key, a);
      continue;
    }
    if (statusRank(a.status) > statusRank(prev.status)) {
      byQuiz.set(key, a);
    } else if (statusRank(a.status) === statusRank(prev.status)) {
      const aTs = new Date(a.submitted_at || a.created_at || 0).getTime();
      const pTs = new Date(prev.submitted_at || prev.created_at || 0).getTime();
      if (aTs >= pTs) byQuiz.set(key, a);
    }
  }
  return [...byQuiz.values()].sort(
    (x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0)
  );
}
