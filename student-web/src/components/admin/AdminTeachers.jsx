import { useState, useEffect } from 'react';
import { api } from '../../api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminTeachers({ token }) {
  const [teachers, setTeachers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [search, setSearch] = useState('');
  const [inviteSchoolId, setInviteSchoolId] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');

  const load = () => {
    api.get('/admin/teachers', token).then(setTeachers).catch(() => {});
    api.get('/admin/schools', token).then(setSchools).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const toggle = async (t) => {
    await fetch(`${BASE}/admin/teachers/${t.id}/suspend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ suspended: !t.is_suspended }),
    });
    load();
  };

  const approve = async (id) => {
    await fetch(`${BASE}/admin/teachers/${id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Remove this teacher? All their classes will be deleted.')) return;
    await fetch(`${BASE}/admin/teachers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  const assignSchool = async (id, school_id) => {
    await fetch(`${BASE}/admin/teachers/${id}/school`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ school_id: school_id || null }),
    });
    load();
  };

  const inviteTeacher = async () => {
    if (!inviteSchoolId) return setInviteError('Select a school first.');
    setInviteError('');
    setInviteMsg('');
    try {
      const data = await api.post('/admin/teacher-link', { school_id: Number(inviteSchoolId) }, token);
      await navigator.clipboard.writeText(data.invite_link);
      setInviteMsg(`Teacher invite link copied for ${data.school_name}.`);
    } catch (e) {
      setInviteError(e.message || 'Failed to generate invite.');
    }
  };

  const pending = teachers.filter(t => !t.is_approved);
  const approved = teachers.filter(t => t.is_approved &&
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
     t.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* ── Pending approval section ── */}
      {pending.length > 0 && (
        <div className="admin-card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 20 }}>
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              ⏳ Abarimu Bategereje Uruhushya
              <span style={{ background: '#fef3c7', color: '#b45309', fontSize: 13, fontWeight: 700,
                borderRadius: 20, padding: '2px 10px', marginLeft: 10 }}>
                {pending.length}
              </span>
            </h2>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Amazina</th><th>Imeyili</th><th>Binjiye</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pending.map(t => (
                  <tr key={t.id} style={{ background: '#fffbeb' }}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.email}</td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button className="btn-sm btn-success" onClick={() => approve(t.id)}>✅ Emera</button>
                      <button className="btn-sm btn-danger" onClick={() => remove(t.id)}>🗑️ Siba</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Approved teachers section ── */}
      <div className="admin-card">
        <div className="admin-section-header">
          <h2 className="admin-section-title">👨‍🏫 Abarimu ({approved.length})</h2>
          <input className="admin-input" style={{ maxWidth: 240 }} placeholder="Shakisha izina cyangwa imeyili..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
          <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 600 }}>Invite new teacher:</span>
          <select className="admin-input" style={{ maxWidth: 220 }} value={inviteSchoolId} onChange={e => setInviteSchoolId(e.target.value)}>
            <option value="">Select school</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="btn-sm btn-primary" onClick={inviteTeacher}>Copy teacher invite link</button>
        </div>
        {inviteError && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{inviteError}</p>}
        {inviteMsg && <p style={{ color: '#166534', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{inviteMsg}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Amazina</th><th>Imeyili</th><th>Ishuri</th><th>Amasomo</th><th>Status</th><th>Binjiye</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {approved.length === 0 && <tr><td colSpan={7} className="empty-text">Nta mwarimu ubonetse.</td></tr>}
              {approved.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td>{t.email}</td>
                  <td>
                    <select
                      className="admin-input"
                      style={{ padding: '0.3rem', minWidth: 120 }}
                      value={t.school_id || ''}
                      onChange={e => assignSchool(t.id, e.target.value)}
                    >
                      <option value="">— None —</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td>{t.class_count}</td>
                  <td>
                    <span className={`badge ${t.is_suspended ? 'badge-red' : 'badge-green'}`}>
                      {t.is_suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button className={`btn-sm ${t.is_suspended ? 'btn-success' : 'btn-warning'}`} onClick={() => toggle(t)}>
                      {t.is_suspended ? '✅ Activate' : '⏸ Suspend'}
                    </button>
                    <button className="btn-sm btn-danger" onClick={() => remove(t.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

