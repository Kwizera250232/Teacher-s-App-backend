import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import ClassMomentCard from './ClassMomentCard';

function storageKey(classId) {
  return `student_class_moments_open_${classId}`;
}

/**
 * Per-class classroom updates — collapsed at bottom of class page so lesson tabs stay primary.
 */
export default function ClassMomentsClassFold({ classId, token, className }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey(classId)) === '1';
    } catch {
      return false;
    }
  });
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(classId), open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open, classId]);

  useEffect(() => {
    if (!open || loaded || !token || !classId) return;
    setLoading(true);
    api
      .get('/class-moments/feed', token)
      .then((rows) => {
        const filtered = (rows || []).filter((m) => String(m.class_id) === String(classId));
        setMoments(filtered.slice(0, 5));
        setLoaded(true);
      })
      .catch(() => setMoments([]))
      .finally(() => setLoading(false));
  }, [open, loaded, token, classId]);

  const todayCount = moments.filter((m) => {
    if (!m.published_at) return false;
    const d = new Date(m.published_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <section className="cm-class-fold" aria-label={`Classroom updates for ${className || 'class'}`}>
      <button
        type="button"
        className="cm-class-fold-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span aria-hidden>{open ? '▼' : '▶'}</span>
        <span>
          <strong>📸 Class updates</strong>
          <span className="cm-class-fold-sub">
            {todayCount > 0
              ? `${todayCount} from today · ${className || 'this class'}`
              : `Optional photos from ${className || 'this class'}`}
          </span>
        </span>
      </button>
      {open && (
        <div className="cm-class-fold-body">
          {loading && <p className="cm-empty">Loading…</p>}
          {!loading && moments.length === 0 && (
            <p className="cm-empty">No photo updates for this class yet.</p>
          )}
          {!loading && moments.length > 0 && (
            <div className="cm-wa-feed-wrap">
              <div className="cm-wa-feed">
                {moments.map((m, i) => (
                  <ClassMomentCard
                    key={m.id}
                    moment={m}
                    token={token}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm cm-class-fold-all"
            onClick={() => navigate('/student/class-moments')}
          >
            All classroom updates →
          </button>
        </div>
      )}
    </section>
  );
}
