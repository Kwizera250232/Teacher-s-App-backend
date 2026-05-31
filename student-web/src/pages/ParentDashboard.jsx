import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import DonateButton from '../components/DonateButton';
import DeanSupportFab from '../components/DeanSupportFab';
import './Dashboard.css';

export default function ParentDashboard() {
  const { user, token, logout } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/parent/children', token)
      .then((list) => {
        setChildren(list);
        if (list.length) setSelectedChild(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-brand">🎓 UClass Parent</div>
        <div className="dash-user">
          <span>👋 {user?.name} (Parent)</span>
          <DonateButton />
          <button className="btn btn-outline" onClick={logout}>Logout</button>
        </div>
      </header>
      <main className="dash-main">
        <h1>Parent Dashboard</h1>
        <p className="dash-sub">Only your invited child&apos;s posts and summary — never other students in the class.</p>
        {error && <div className="alert alert-error">{error}</div>}
        {children.length === 0 ? (
          <p>Use the invitation link from your child&apos;s teacher to connect your account.</p>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              Your child:{' '}
              <select
                value={selectedChild || ''}
                onChange={(e) => setSelectedChild(Number(e.target.value))}
                style={{ padding: '0.4rem', borderRadius: 8 }}
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            {selectedChild && (
              <ParentChildFeed studentId={selectedChild} token={token} />
            )}
          </>
        )}
      </main>
      <DeanSupportFab token={token} />
    </div>
  );
}

export function ParentChildFeed({ studentId, token }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/parent/children/${studentId}/feed`, token)
      .then(setPosts)
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {posts.length === 0 ? (
        <p>No posts yet from teachers or your child.</p>
      ) : (
        posts.map((p) => (
          <article key={p.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem' }}>
            <strong>{p.author_name}</strong> · {p.class_name}
            <p style={{ margin: '0.5rem 0' }}>{p.body}</p>
            {p.classwork_summary && <p><em>{p.classwork_summary}</em></p>}
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>❤️ {p.like_count} · 💬 {p.comment_count}</span>
          </article>
        ))
      )}
    </div>
  );
}
