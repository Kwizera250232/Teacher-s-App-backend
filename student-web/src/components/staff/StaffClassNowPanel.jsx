import { useCallback, useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import ClassMomentCard from '../classMoments/ClassMomentCard';
import AddClassMomentModal from '../classMoments/AddClassMomentModal';
import '../classMoments/ClassMoments.css';

export default function StaffClassNowPanel({ token, classes }) {
  const { user } = useAuth();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadFeed = useCallback(() => {
    setLoading(true);
    api
      .get('/class-moments/feed', token)
      .then(setMoments)
      .catch(() => setMoments([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const onDelete = async (momentId) => {
    if (!window.confirm('Remove this class moment? Parents and students will no longer see it.')) return;
    setDeletingId(momentId);
    try {
      await api.delete(`/class-moments/${momentId}`, token);
      setMoments((prev) => prev.filter((m) => m.id !== momentId));
    } catch (err) {
      alert(err.message || 'Could not delete.');
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = (m) => user?.role === 'admin' || m.teacher_id === user?.id;

  return (
    <section className="cm-staff-panel">
      <div className="cm-staff-panel-head">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>📸 Class Now</h2>
          <p className="phub-muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            Share today&apos;s classroom with photos — parents and students are notified instantly.
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
                onReactionsChange={(momentId, reactions) => {
                  setMoments((prev) =>
                    prev.map((x) => (x.id === momentId ? { ...x, reactions } : x))
                  );
                }}
              />
              {canDelete(m) && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm cm-delete-btn"
                  disabled={deletingId === m.id}
                  onClick={() => onDelete(m.id)}
                >
                  {deletingId === m.id ? 'Removing…' : 'Remove post'}
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
          user={user}
          onClose={() => setShowAdd(false)}
          onPublished={(moment, meta) => {
            if (meta?.replaceId) {
              setMoments((prev) =>
                prev.map((m) => (m.id === meta.replaceId ? { ...moment, _pending: false } : m))
              );
              return;
            }
            if (meta?.pendingId) {
              setMoments((prev) => [moment, ...prev]);
              return;
            }
            loadFeed();
          }}
          onUploadFailed={(pendingId, message) => {
            setMoments((prev) => prev.filter((m) => m.id !== pendingId));
            alert(message || 'Could not publish. Try again.');
          }}
        />
      )}
    </section>
  );
}
