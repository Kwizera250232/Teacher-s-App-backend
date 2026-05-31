import { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AdminSchools({ token }) {
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState({ name: '', location: '', code: '', email_domain: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [inviteMsg, setInviteMsg] = useState('');

  const load = () => api.get('/admin/schools', token).then(setSchools).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return setError('School name is required.');
    try {
      if (editing) {
        await api.put(`/admin/schools/${editing}`, form, token);
      } else {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/admin/schools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        });
      }
      setForm({ name: '', location: '', code: '', email_domain: '' });
      setEditing(null);
      setError('');
      load();
    } catch (e) { setError(e.message); }
  };

  const del = async (id) => {
    if (!confirm('Delete this school?')) return;
    await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/admin/schools/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    load();
  };

  const edit = (s) => { setEditing(s.id); setForm({ name: s.name, location: s.location || '', code: s.code || '', email_domain: s.email_domain || '' }); };

  const copyCode = (id, code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const generateHeadTeacherInvite = async (schoolId = null) => {
    try {
      setError('');
      setInviteMsg('');
      const data = await api.post('/admin/ht-link', { school_id: schoolId }, token);
      await navigator.clipboard.writeText(data.invite_link);
      setInviteMsg(`Head Teacher invitation link copied${data.school_name ? ` for ${data.school_name}` : ''}.`);
    } catch (e) {
      setError(e.message || 'Failed to generate invitation link.');
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-section-header">
        <h2 className="admin-section-title">🏫 Schools</h2>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}
      {inviteMsg && <div style={{ color: '#166534', marginBottom: '1rem', fontSize: '0.875rem' }}>{inviteMsg}</div>}

      <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-sm btn-outline" onClick={() => generateHeadTeacherInvite(null)}>
          Copy General HT Invite Link
        </button>
      </div>

      <div className="admin-form-row">
        <input className="admin-input" placeholder="School Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className="admin-input" placeholder="Location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
        <input className="admin-input" placeholder="Code (optional)" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
        <input className="admin-input" placeholder="Email domain e.g. brightschool.edu" value={form.email_domain} onChange={e => setForm(f => ({ ...f, email_domain: e.target.value }))} />
        <button className="btn-sm btn-primary" onClick={save}>{editing ? 'Update' : '+ Add School'}</button>
        {editing && <button className="btn-sm btn-outline" onClick={() => { setEditing(null); setForm({ name: '', location: '', code: '', email_domain: '' }); }}>Cancel</button>}
      </div>

      <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '-0.25rem', marginBottom: '1rem' }}>
        After adding a school, give the <strong>School Code</strong> to the Head Teacher. The HT will use it to sign up and share it with their teachers.
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>#</th><th>Name</th><th>Location</th><th>School Code</th><th>Email Domain</th><th>Users</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {schools.length === 0 && <tr><td colSpan={8} className="empty-text">No schools yet.</td></tr>}
            {schools.map((s, i) => (
              <tr key={s.id}>
                <td>{i + 1}</td>
                <td><strong>{s.name}</strong></td>
                <td>{s.location || '—'}</td>
                <td>
                  {s.code ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.1em', color: '#1d4ed8', background: '#eff6ff', padding: '2px 8px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                        {s.code}
                      </span>
                      <button
                        className="btn-sm btn-outline"
                        title="Copy code"
                        onClick={() => copyCode(s.id, s.code)}
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                      >
                        {copiedId === s.id ? '✅ Copied' : '📋 Copy'}
                      </button>
                    </div>
                  ) : '—'}
                </td>
                <td>{s.email_domain || '—'}</td>
                <td>{s.user_count}</td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn-sm btn-warning" onClick={() => edit(s)}>✏️ Edit</button>
                  <button className="btn-sm btn-outline" onClick={() => generateHeadTeacherInvite(s.id)}>Invite HT</button>
                  <button className="btn-sm btn-danger" onClick={() => del(s.id)}>🗑️ Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
