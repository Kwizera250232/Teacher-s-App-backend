import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import ClassMomentsFeed from '../components/classMoments/ClassMomentsFeed';
import ClassMomentCard from '../components/classMoments/ClassMomentCard';
import '../components/classMoments/ClassMoments.css';

export default function ClassMomentsPage({ backPath }) {
  const { token, user } = useAuth();
  const { id } = useParams();
  const [moments, setMoments] = useState([]);
  const [single, setSingle] = useState(null);
  const [loading, setLoading] = useState(true);

  const home = backPath || dashboardPath(user?.role);

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
    setLoading(true);
    api
      .get('/class-moments/feed', token)
      .then(setMoments)
      .catch(() => setMoments([]))
      .finally(() => setLoading(false));
  }, [id, token, user?.role]);

  const patchReactions = (momentId, reactions) => {
    const patch = (m) => (m.id === momentId ? { ...m, reactions } : m);
    setMoments((prev) => prev.map(patch));
    setSingle((s) => (s?.id === momentId ? { ...s, reactions } : s));
  };

  return (
    <div className="dashboard cm-page cm-wa-page">
      <header className="cm-wa-header">
        <Link to={home} className="btn btn-secondary btn-sm">
          ← Back
        </Link>
        <h1>📸 Today&apos;s Class Moments</h1>
      </header>
      {id ? (
        loading ? (
          <p className="cm-wa-empty">Loading…</p>
        ) : single ? (
          <div className="cm-wa-feed">
            <ClassMomentCard moment={single} token={token} onReactionsChange={patchReactions} />
          </div>
        ) : (
          <p className="cm-wa-empty">Moment not found.</p>
        )
      ) : (
        <ClassMomentsFeed
          moments={moments}
          loading={loading}
          token={token}
          onReactionsChange={patchReactions}
        />
      )}
    </div>
  );
}
