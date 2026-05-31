import { useState, useEffect } from 'react';
import { api } from '../api';
import './CompositionStatusPanel.css';

export default function CompositionStatusList({ token, classId, schoolWide = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setLoading(true);
    const path = schoolWide ? '/composition-status/school' : `/composition-status/class/${classId}`;
    api.get(path, token)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token, classId, schoolWide]);

  const recordView = async (id) => {
    try {
      await api.post(`/composition-status/${id}/view`, {}, token);
    } catch {
      /* ignore */
    }
  };

  if (loading) return <p className="csp-muted">Loading composition statuses…</p>;
  if (!items.length) {
    return <p className="csp-muted">No active composition status this week.</p>;
  }

  return (
    <div className="csp-teacher-list">
      {items.map((s) => (
        <div key={s.id} className="csp-teacher-card">
          <button
            type="button"
            className="csp-teacher-head"
            onClick={() => {
              const next = expanded === s.id ? null : s.id;
              setExpanded(next);
              if (next) recordView(s.id);
            }}
          >
            <span className="csp-teacher-avatar">{(s.student_name || '?').slice(0, 1)}</span>
            <span>
              <strong>{s.student_name}</strong>
              <small>{s.title} · 👁 {s.view_count || 0}</small>
            </span>
          </button>
          {expanded === s.id && (
            <div className="csp-teacher-body">
              <p>{s.intro}</p>
              <p className="csp-meta">Expires {new Date(s.expires_at).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
