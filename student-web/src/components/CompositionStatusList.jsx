import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import './CompositionStatusPanel.css';

export default function CompositionStatusList({ token, classId, schoolWide = false }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [subLoading, setSubLoading] = useState(null);

  const isStaff = ['teacher', 'head_teacher', 'admin'].includes(user?.role);

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

  const subscribe = async (targetId, statusId) => {
    setSubLoading(statusId);
    try {
      await api.post(`/profile/${targetId}/subscribe`, {}, token);
      const path = schoolWide ? '/composition-status/school' : `/composition-status/class/${classId}`;
      const refreshed = await api.get(path, token);
      setItems(refreshed);
      setExpanded(statusId);
    } catch {
      /* ignore */
    } finally {
      setSubLoading(null);
    }
  };

  if (loading) return <p className="csp-muted">Loading composition statuses…</p>;
  if (!items.length) {
    return <p className="csp-muted">No active composition status this week.</p>;
  }

  return (
    <div className="csp-teacher-list">
      {items.map((s) => {
        const locked = s.locked && !s.can_view_full && !isStaff;
        return (
          <div key={s.id} className={`csp-teacher-card${locked ? ' csp-teacher-card--locked' : ''}`}>
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
                <small>{s.title} · 👁 {s.view_count || 0}{locked ? ' · 🔒' : ''}</small>
              </span>
            </button>
            {expanded === s.id && (
              <div className="csp-teacher-body">
                {locked ? (
                  <div className="csp-lock-panel">
                    <p>{s.lock_message}</p>
                    <p className="csp-lock-teaser">{s.intro}</p>
                    <button
                      type="button"
                      className="csp-subscribe-btn"
                      disabled={subLoading === s.id}
                      onClick={() => subscribe(s.subscribe_target_id || s.student_id, s.id)}
                    >
                      {subLoading === s.id ? 'Subscribing…' : `Subscribe to ${s.student_name}`}
                    </button>
                  </div>
                ) : (
                  <>
                    <p>{s.intro}</p>
                    <p className="csp-meta">Expires {new Date(s.expires_at).toLocaleDateString()}</p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
