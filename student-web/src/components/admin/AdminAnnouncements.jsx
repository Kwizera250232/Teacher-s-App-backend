import { useState, useEffect } from 'react';
import { api } from '../../api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminAnnouncements({ token }) {
  const [list, setList] = useState([]);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState({ title: '', message: '', target: 'all', school_id: '' });
  const [error, setError] = useState('');

  const load = () => {
    api.get('/admin/announcements', token).then(setList).catch(() => {});
    api.get('/admin/schools', token).then(setSchools).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!form.title || !form.message) return setError('Title and message are required.');
    const res = await fetch(`${BASE}/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...form, school_id: form.school_id || null }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setForm({ title: '', message: '', target: 'all', school_id: '' });
    setError('');
    load();
  };

  const del = async (id) => {
    await fetch(`${BASE}/admin/announcements/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="admin-card">
        <h2 className="admin-section-title" style={{ marginBottom: '1rem' }}>📢 Send Announcement</h2>
        {error && <div style={{ color: '#dc2626', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{error}</div>}
        <div className="admin-form-row">
          <input className="admin-input" placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <select className="admin-input" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))}>
            <option value="all">Everyone</option>
            <option value="teachers">Teachers only</option>
            <option value="students">Students only</option>
            <option value="school">Specific School</option>
          </select>
          {form.target === 'school' && (
            <select className="admin-input" value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}>
              <option value="">Select school...</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        <textarea
          className="admin-input"
          style={{ width: '100%', minHeight: 100, resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Message *"
          value={form.message}
          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
        />
        <div style={{ marginTop: '0.75rem' }}>
          <button className="btn-sm btn-primary" onClick={send}>📤 Send Announcement</button>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-section-title" style={{ marginBottom: '1rem' }}>📋 Sent Announcements</h2>
        {list.length === 0 && <p className="empty-text">No announcements sent yet.</p>}
        {list.map(a => (
          <div key={a.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{a.title}</strong>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-blue">{a.target === 'school' ? `School: ${a.school_name}` : a.target}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(a.created_at).toLocaleString()}</span>
                </div>
              </div>
              <button className="btn-sm btn-danger" onClick={() => del(a.id)}>🗑️</button>
            </div>
            <p style={{ margin: '0.75rem 0 0', color: '#475569', fontSize: '0.875rem', lineHeight: 1.6 }}>{a.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
