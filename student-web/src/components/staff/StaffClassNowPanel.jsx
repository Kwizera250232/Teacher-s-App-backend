import { useCallback, useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import ClassMomentCard from '../classMoments/ClassMomentCard';
import AddClassMomentModal from '../classMoments/AddClassMomentModal';
import { momentIdNum } from '../../utils/momentReactions';
import '../classMoments/ClassMoments.css';

function isStalePending(m) {
  if (!m?._pending) return false;
  const t = new Date(m.published_at || 0).getTime();
  return !t || Date.now() - t > 4 * 60 * 1000;
}

export default function StaffClassNowPanel({ token, classes }) {
  const { user } = useAuth();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const loadFeedRef = useRef(null);

  const loadFeed = useCallback(() => {
    setLoading(true);
    return api
      .get('/class-moments/feed', token)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setMoments(list.filter((m) => !String(m.id || '').startsWith('pending')));
      })
      .catch(() => setMoments([]))
      .finally(() => setLoading(false));
  }, [token]);

  loadFeedRef.current = loadFeed;

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const hasPending = moments.some((m) => m._pending);
    if (!hasPending) return undefined;
    const id = setInterval(() => {
      setMoments((prev) => {
        const next = prev.filter((m) => !isStalePending(m));
        if (next.length !== prev.length) {
          loadFeedRef.current?.();
        }
        return next;
      });
    }, 15000);
    return () => clearInterval(id);
  }, [moments]);

  const onDelete = async (momentId) => {
    const id = momentIdNum(momentId);
    if (!id) return;
    if (!window.confirm('Remove this class moment? Parents and students will no longer see it.')) return;
    setDeletingId(id);
    try {
      await api.delete(`/class-moments/${id}`, token);
      setMoments((prev) => prev.filter((m) => momentIdNum(m.id) !== id));
    } catch (err) {
      alert(err.message || 'Could not delete.');
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = (m) => {
    const id = momentIdNum(m.id);
    return id && (user?.role === 'admin' || m.teacher_id === user?.id);
  };

  const patchReactions = (momentId, reactions) => {
    setMoments((prev) =>
      prev.map((m) => (momentIdNum(m.id) === momentId ? { ...m, reactions } : m))
    );
  };

  return (
    <section className="cm-staff-panel">
      <div className="cm-staff-panel-head">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#075e54' }}>📸 Class Now</h2>
          <p className="phub-muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            WhatsApp-style updates for parents and students — like and react on each post.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!classes?.length}
          onClick={() => setShowAdd(true)}
        >
          + Add Class Moment
        </button>
      </div>

      {!classes?.length ? (
        <p className="phub-muted">Create or open a class first, then share a moment.</p>
      ) : loading ? (
        <p className="cm-wa-empty">Loading moments…</p>
      ) : !moments.length ? (
        <div className="cm-empty-state">
          <span className="cm-empty-icon">📷</span>
          <p>No moments yet. Tap &quot;Add Class Moment&quot; to share photos from today&apos;s lesson.</p>
        </div>
      ) : (
        <div className="cm-wa-feed-wrap">
          <div className="cm-wa-feed">
            {moments.map((m, i) => (
              <div key={m.id} className="cm-staff-card-wrap">
                <ClassMomentCard
                  moment={m}
                  token={token}
                  style={{ animationDelay: `${i * 0.05}s` }}
                  onReactionsChange={patchReactions}
                />
                {canDelete(m) && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm cm-delete-btn"
                    disabled={deletingId === momentIdNum(m.id)}
                    onClick={() => onDelete(m.id)}
                  >
                    {deletingId === momentIdNum(m.id) ? 'Removing…' : 'Remove post'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <AddClassMomentModal
          token={token}
          classes={classes}
          onClose={() => setShowAdd(false)}
          onPublished={(moment) => {
            setMoments((prev) => {
              const id = momentIdNum(moment.id);
              const withoutDup = prev.filter((m) => momentIdNum(m.id) !== id && !m._pending);
              return [moment, ...withoutDup];
            });
          }}
        />
      )}
    </section>
  );
}
