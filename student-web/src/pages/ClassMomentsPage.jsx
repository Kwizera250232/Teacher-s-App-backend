import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import ClassMomentsFeed from '../components/classMoments/ClassMomentsFeed';
import ClassMomentCard from '../components/classMoments/ClassMomentCard';
import AddClassMomentModal from '../components/classMoments/AddClassMomentModal';
import '../components/classMoments/ClassMoments.css';

const STAFF_ROLES = new Set(['teacher', 'head_teacher', 'admin']);

export default function ClassMomentsPage({ backPath }) {
  const { token, user } = useAuth();
  const { id } = useParams();
  const [moments, setMoments] = useState([]);
  const [single, setSingle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  const home = backPath || dashboardPath(user?.role);
  const isStaff = STAFF_ROLES.has(user?.role);
  const canPost = isStaff;

  const loadFeed = useCallback(() => {
    if (id) return;
    setLoading(true);
    api
      .get('/class-moments/feed', token)
      .then(setMoments)
      .catch(() => setMoments([]))
      .finally(() => setLoading(false));
  }, [id, token]);

  useEffect(() => {
    if (id) {
      setLoading(true);
      api
        .get(`/class-moments/${id}`, token)
        .then((m) => {
          setSingle(m);
          if (user?.role === 'parent' && m?.id) {
            api.put(`/parent/notifications/read-by-moment/${m.id}`, {}, token).catch(() => {});
          }
        })
        .catch(() => setSingle(null))
        .finally(() => setLoading(false));
      return;
    }
    loadFeed();
  }, [id, token, user?.role, loadFeed]);

  useEffect(() => {
    if (!canPost || !token) return;
    api
      .get('/classes', token)
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [canPost, token]);

  const patchReactions = (momentId, reactions) => {
    const patch = (m) => (m.id === momentId ? { ...m, reactions } : m);
    setMoments((prev) => prev.map(patch));
    setSingle((s) => (s?.id === momentId ? { ...s, reactions } : s));
  };

  const onPublished = (moment, meta) => {
    if (meta?.replaceId) {
      setMoments((prev) =>
        prev.map((m) => (m.id === meta.replaceId ? { ...moment, _pending: false } : m))
      );
      if (single?.id === meta.replaceId) {
        setSingle({ ...moment, _pending: false });
      }
      return;
    }
    if (meta?.pendingId) {
      setMoments((prev) => [moment, ...prev]);
      return;
    }
    loadFeed();
  };

  const emptyHint = () => {
    if (canPost) {
      return (
        <>
          <p>No class moments yet. Tap the green button below to share photos from today&apos;s lesson.</p>
          <p style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
            Posts look like WhatsApp updates — students and parents can like and react.
          </p>
        </>
      );
    }
    if (user?.role === 'student') {
      return (
        <>
          <p>Your teacher has not shared photos yet today.</p>
          <p style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
            When they post from <strong>Class Now</strong>, updates appear here like WhatsApp — tap Like or React.
          </p>
        </>
      );
    }
    return (
      <p>
        No class moments yet. When the teacher shares photos from today&apos;s lesson, they will appear here like
        WhatsApp messages.
      </p>
    );
  };

  return (
    <div className="dashboard cm-page cm-wa-page cm-soc-page">
      <header className="cm-wa-header">
        <Link to={home} className="btn btn-secondary btn-sm">
          ← Back
        </Link>
        <h1>📸 Today&apos;s Class Moments</h1>
        {canPost && (
          <p className="cm-wa-header-sub">Share photos — families see them in a WhatsApp-style feed</p>
        )}
      </header>

      {id ? (
        loading ? (
          <p className="cm-wa-empty">Loading…</p>
        ) : single ? (
          <div className="cm-soc-feed-wrap">
            <div className="cm-soc-feed">
              <ClassMomentCard moment={single} token={token} onReactionsChange={patchReactions} />
            </div>
          </div>
        ) : (
          <p className="cm-wa-empty">Moment not found.</p>
        )
      ) : (
        <>
          <ClassMomentsFeed
            moments={moments}
            loading={loading}
            token={token}
            onReactionsChange={patchReactions}
            emptyContent={!loading && !moments?.length ? emptyHint() : null}
          />
          {canPost && (
            <button
              type="button"
              className="cm-fab"
              aria-label="Add class moment"
              disabled={!classes.length}
              title={classes.length ? 'Share photos from class' : 'Create a class first'}
              onClick={() => setShowAdd(true)}
            >
              +
            </button>
          )}
        </>
      )}

      {showAdd && (
        <AddClassMomentModal
          token={token}
          classes={classes}
          user={user}
          onClose={() => setShowAdd(false)}
          onPublished={onPublished}
          onUploadFailed={(pendingId, message) => {
            setMoments((prev) => prev.filter((m) => m.id !== pendingId));
            alert(message || 'Upload failed. Check your connection and try again.');
          }}
        />
      )}
    </div>
  );
}
