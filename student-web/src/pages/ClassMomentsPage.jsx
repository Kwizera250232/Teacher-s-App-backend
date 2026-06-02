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

  return (
    <div className="dashboard cm-page" style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header className="dash-header" style={{ marginBottom: 12 }}>
        <Link to={home} className="btn btn-secondary btn-sm">
          ← Back
        </Link>
        <h1 style={{ margin: '8px 0 0', fontSize: '1.2rem' }}>📸 Today&apos;s Class Moments</h1>
      </header>
      {id ? (
        loading ? (
          <p className="cm-empty">Loading…</p>
        ) : single ? (
          <ClassMomentCard moment={single} />
        ) : (
          <p className="cm-empty">Moment not found.</p>
        )
      ) : (
        <ClassMomentsFeed moments={moments} loading={loading} />
      )}
    </div>
  );
}
