import { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AdminTeachers({ token }) {
  const [teachers, setTeachers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [search, setSearch] = useState('');
  const [inviteSchoolId, setInviteSchoolId] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    school_id: '',
    role: 'teacher',
  });
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState('');
  const [pendingSchool, setPendingSchool] = useState({});

  const load = () => {
    api.get('/admin/teachers', token).then(setTeachers).catch(() => {});
    api.get('/admin/schools', token).then(setSchools).catch(() => {});
  };
  useEffect(() => { load(); }, [token]);

  const toggle = async (t) => {
    await api.put(`/admin/teachers/${t.id}/suspend`, { suspended: !t.is_suspended }, token);
    load();
  };

  const approve = async (id) => {
    const school_id = pendingSchool[id] ? Number(pendingSchool[id]) : undefined;
    await api.put(`/admin/teachers/${id}/approve`, school_id ? { school_id } : {}, token);
    load();
  };

  const remove = async (id) => {
    if (!confirm('Remove this teacher? All their classes will be deleted.')) return;
    await api.delete(`/admin/teachers/${id}`, token);
    load();
  };

  const assignSchool = async (id, school_id) => {
    const payload = school_id ? { school_id: Number(school_id) } : { school_id: null };
    await api.put(`/admin/teachers/${id}/school`, payload, token);
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

  const addTeacher = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password.trim() || !addForm.school_id) {
      return setInviteError('Name, email, password, and school are required to add a teacher.');
    }
    setAddBusy(true);
    setInviteError('');
    setAddMsg('');
    try {
      const res = await api.post('/admin/teachers', {
        name: addForm.name.trim(),
        email: addForm.email.trim().toLowerCase(),
        password: addForm.password.trim(),
        school_id: Number(addForm.school_id),
        role: addForm.role,
      }, token);
      setAddMsg(res.message || 'Teacher added.');
      setAddForm({ name: '', email: '', password: '', school_id: '', role: 'teacher' });
      load();
    } catch (err) {
      setInviteError(err.message || 'Could not add teacher.');
    } finally {
      setAddBusy(false);
    }
  };

  const pending = teachers.filter((t) => !t.is_approved);
  const approved = teachers.filter(
    (t) =>
      t.is_approved &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase()) ||
        (t.school_name || '').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {pending.length > 0 && (
        <div className="admin-card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 20 }}>
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              ⏳ Abarimu Bategereje Uruhushya
              <span
                style={{
                  background: '#fef3c7',
                  color: '#b45309',
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 20,
                  padding: '2px 10px',
                  marginLeft: 10,
                }}
              >
                {pending.length}
              </span>
            </h2>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Amazina</th>
                  <th>Imeyili</th>
                  <th>Ishuri (assign on approve)</th>
                  <th>Binjiye</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((t) => (
                  <tr key={t.id} style={{ background: '#fffbeb' }}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.email}</td>
                    <td>
                      <select
                        className="admin-input"
                        style={{ padding: '0.3rem', minWidth: 140 }}
                        value={pendingSchool[t.id] || t.school_id || ''}
                        onChange={(e) =>
                          setPendingSchool((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                      >
                        <option value="">— Select school —</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button className="btn-sm btn-success" type="button" onClick={() => approve(t.id)}>
                        ✅ Emera
                      </button>
                      <button className="btn-sm btn-danger" type="button" onClick={() => remove(t.id)}>
                        🗑️ Siba
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-section-header">
          <h2 className="admin-section-title">👨‍🏫 Abarimu ({approved.length})</h2>
          <input
            className="admin-input"
            style={{ maxWidth: 240 }}
            placeholder="Shakisha izina, imeyili, ishuri..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <form
          onSubmit={addTeacher}
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            background: '#eff6ff',
            borderRadius: 8,
            border: '1px solid #93c5fd',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 10, color: '#1e40af' }}>
            ➕ Ongeraho umwarimu mu ishuri / Add teacher to school
          </strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <input
              className="admin-input"
              placeholder="Full name"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              disabled={addBusy}
            />
            <input
              className="admin-input"
              type="email"
              placeholder="email@brightschool.edu"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              disabled={addBusy}
            />
            <input
              className="admin-input"
              type="password"
              placeholder="Temporary password"
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              disabled={addBusy}
            />
            <select
              className="admin-input"
              value={addForm.school_id}
              onChange={(e) => setAddForm((f) => ({ ...f, school_id: e.target.value }))}
              disabled={addBusy}
            >
              <option value="">Select school (Ishuri)</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              className="admin-input"
              value={addForm.role}
              onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
              disabled={addBusy}
            >
              <option value="teacher">Teacher</option>
              <option value="head_teacher">Head teacher</option>
            </select>
            <button type="submit" className="btn-sm btn-primary" disabled={addBusy}>
              {addBusy ? 'Adding…' : 'Add teacher'}
            </button>
          </div>
          {addMsg && <p style={{ color: '#166534', fontSize: '0.85rem', marginTop: 8 }}>{addMsg}</p>}
        </form>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '1rem',
            padding: '0.75rem',
            background: '#f0fdf4',
            borderRadius: 8,
            border: '1px solid #86efac',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 600 }}>Or invite link:</span>
          <select
            className="admin-input"
            style={{ maxWidth: 220 }}
            value={inviteSchoolId}
            onChange={(e) => setInviteSchoolId(e.target.value)}
          >
            <option value="">Select school</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="button" className="btn-sm btn-primary" onClick={inviteTeacher}>
            Copy teacher invite link
          </button>
        </div>
        {inviteError && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{inviteError}</p>}
        {inviteMsg && <p style={{ color: '#166534', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{inviteMsg}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Amazina</th>
                <th>Imeyili</th>
                <th>Ishuri</th>
                <th>Amasomo</th>
                <th>Status</th>
                <th>Binjiye</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {approved.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-text">Nta mwarimu ubonetse.</td>
                </tr>
              )}
              {approved.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    {t.role === 'head_teacher' && (
                      <span className="badge badge-blue" style={{ marginLeft: 6 }}>HT</span>
                    )}
                  </td>
                  <td>{t.email}</td>
                  <td>
                    <select
                      className="admin-input"
                      style={{ padding: '0.3rem', minWidth: 140 }}
                      value={t.school_id != null ? String(t.school_id) : ''}
                      onChange={(e) => assignSchool(t.id, e.target.value || null)}
                    >
                      <option value="">— None —</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {t.school_name && (
                      <small style={{ display: 'block', color: '#166534', marginTop: 4 }}>
                        {t.school_name}
                      </small>
                    )}
                  </td>
                  <td>{t.class_count}</td>
                  <td>
                    <span className={`badge ${t.is_suspended ? 'badge-red' : 'badge-green'}`}>
                      {t.is_suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn-sm ${t.is_suspended ? 'btn-success' : 'btn-warning'}`}
                      onClick={() => toggle(t)}
                    >
                      {t.is_suspended ? '✅ Activate' : '⏸ Suspend'}
                    </button>
                    <button type="button" className="btn-sm btn-danger" onClick={() => remove(t.id)}>
                      🗑️
                    </button>
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
