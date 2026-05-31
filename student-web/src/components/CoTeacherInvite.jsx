import { useState, useEffect } from 'react';
import { api } from '../api';

export default function CoTeacherInvite({ classId, token }) {
  const [coTeachers, setCoTeachers] = useState([]);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api.get(`/classroom-feed/${classId}/co-teachers`, token)
      .then(setCoTeachers)
      .catch(() => setCoTeachers([]));
  };

  useEffect(() => { load(); }, [classId]);

  const copyLink = async () => {
    setError('');
    try {
      const data = await api.post(`/classroom-feed/${classId}/co-teacher-link`, {}, token);
      await navigator.clipboard.writeText(data.invite_link);
      setMsg('Co-teacher invite link copied. Share by email or chat.');
    } catch (e) {
      setError(e.message);
    }
  };

  const addByEmail = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.post(`/classroom-feed/${classId}/co-teachers`, { email }, token);
      setEmail('');
      setMsg('Co-teacher added to this class.');
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="co-teacher-panel" style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
      <h4 style={{ margin: '0 0 0.5rem' }}>👥 Invite Co-Teacher</h4>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#166534' }}>
        Add another teacher to manage this class. Use email if they already have an account, or share an invite code link.
      </p>
      {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
      {msg && <p style={{ color: '#166534', fontSize: '0.85rem' }}>{msg}</p>}
      <form onSubmit={addByEmail} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          type="email"
          placeholder="co-teacher@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '0.5rem', borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <button type="submit" className="btn btn-primary btn-sm">Add by email</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>Copy invite link</button>
      </form>
      {coTeachers.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
          {coTeachers.map((t) => (
            <li key={t.id}>{t.name} ({t.email})</li>
          ))}
        </ul>
      )}
    </div>
  );
}
