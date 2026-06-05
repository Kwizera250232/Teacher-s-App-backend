import { useEffect, useState } from 'react';
import { api } from '../api';
import StudentGroupQuizCards from './StudentGroupQuizCards';

const STORAGE_KEY = 'student_group_work_fold_open';

export default function StudentGroupWorkFold({ token, classes }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      /* ignore */
    }
    return true;
  });

  useEffect(() => {
    if (!token || !classes?.length) {
      setAssignments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      classes.map((cls) =>
        api
          .get(`/classes/${cls.id}/my-groups`, token)
          .then((groups) => {
            const rows = [];
            for (const g of Array.isArray(groups) ? groups : []) {
              for (const a of g.assignments || []) {
                rows.push({
                  ...a,
                  class_id: cls.id,
                  class_name: cls.name,
                  group_name: g.name,
                  members: g.members,
                });
              }
            }
            return rows;
          })
          .catch(() =>
            api
              .get(`/classes/${cls.id}/my-group-quizzes`, token)
              .then((list) =>
                (Array.isArray(list) ? list : []).map((a) => ({
                  ...a,
                  class_id: cls.id,
                  class_name: cls.name,
                }))
              )
              .catch(() => [])
          )
      )
    )
      .then((rows) => {
        if (!cancelled) setAssignments(rows.flat());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, classes]);

  const pending = assignments.filter((a) => a.status !== 'submitted').length;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  if (!loading && assignments.length === 0) return null;

  const summary = pending
    ? `${pending} group quiz${pending === 1 ? '' : 'zes'} to work on`
    : `${assignments.length} group assignment${assignments.length === 1 ? '' : 's'}`;

  return (
    <section className="cm-fold student-group-work-fold" aria-label="Group work" id="student-group-work">
      <div className="cm-fold-header">
        <button
          type="button"
          className="cm-fold-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="cm-fold-toggle-icon" aria-hidden>
            {open ? '▼' : '▶'}
          </span>
          <span className="cm-fold-toggle-text">
            <span className="cm-fold-title">👥 Group work</span>
            <span className="cm-fold-sub">{loading ? 'Loading…' : summary}</span>
          </span>
          {pending > 0 && (
            <span className="cm-fold-badge" style={{ background: '#f59e0b', color: '#fff' }}>
              {pending}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className="cm-fold-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <StudentGroupQuizCards
            assignments={assignments}
            showClassName
            emptyMessage="No group quizzes assigned yet."
          />
          {assignments.length > 0 && (
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              You can also open a class → <strong>Groups</strong> tab.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function groupWorkCountByClass(assignments) {
  const map = {};
  for (const a of assignments || []) {
    if (a.status === 'submitted') continue;
    const id = a.class_id;
    map[id] = (map[id] || 0) + 1;
  }
  return map;
}
