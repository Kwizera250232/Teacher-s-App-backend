import { useState, useEffect } from 'react';
import { api } from '../../api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminStudents({ token }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [resetId, setResetId] = useState(null);
  const [newPwd, setNewPwd] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api.get('/admin/students', token).then(setStudents).catch(() => {});
  useEffect(() => { load(); }, []);

  const toggle = async (s) => {
    await fetch(`${BASE}/admin/students/${s.id}/suspend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ suspended: !s.is_suspended }),
    });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Remove this student?')) return;
    await fetch(`${BASE}/admin/students/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  const resetPassword = async () => {
    if (newPwd.length < 6) return setMsg('Password must be at least 6 characters.');
    const res = await fetch(`${BASE}/admin/students/${resetId}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ new_password: newPwd }),
    });
    const data = await res.json();
    if (data.success) { setMsg('Password reset!'); setResetId(null); setNewPwd(''); }
    else setMsg(data.error);
  };

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-card">
      <div className="admin-section-header">
        <h2 className="admin-section-title">👩‍🎓 Students ({students.length})</h2>
        <input className="admin-input" style={{ maxWidth: 240 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {msg && <div style={{ marginBottom: '1rem', color: '#16a34a', fontSize: '0.875rem' }}>{msg}</div>}

      {resetId && (
        <div className="admin-form-row" style={{ background: '#f8fafc', padding: '1rem', borderRadius: 12, marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#475569', alignSelf: 'center' }}>New password for student:</span>
          <input className="admin-input" type="password" placeholder="New password (min 6)" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
          <button className="btn-sm btn-primary" onClick={resetPassword}>Set Password</button>
          <button className="btn-sm btn-outline" onClick={() => setResetId(null)}>Cancel</button>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>School</th><th>Classes</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="empty-text">No students found.</td></tr>}
            {filtered.map(s => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td>{s.email}</td>
                <td>{s.school_name || '—'}</td>
                <td>{s.class_count}</td>
                <td><span className={`badge ${s.is_suspended ? 'badge-red' : 'badge-green'}`}>{s.is_suspended ? 'Suspended' : 'Active'}</span></td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button className={`btn-sm ${s.is_suspended ? 'btn-success' : 'btn-warning'}`} onClick={() => toggle(s)}>
                    {s.is_suspended ? '✅' : '⏸'}
                  </button>
                  <button className="btn-sm btn-outline" onClick={() => { setResetId(s.id); setMsg(''); }}>🔑</button>
                  <button className="btn-sm btn-danger" onClick={() => remove(s.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
