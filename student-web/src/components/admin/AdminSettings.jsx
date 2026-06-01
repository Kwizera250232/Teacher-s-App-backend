import { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AdminSettings({ token }) {
  const [settings, setSettings] = useState({ platform_name: '', logo_url: '' });
  const [saved, setSaved] = useState(false);
  const [schools, setSchools] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'student', school_id: '' });
  const [createdUser, setCreatedUser] = useState(null);
  const [bulkNames, setBulkNames] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');
  const [singlePassword, setSinglePassword] = useState('');
  const [bulkResult, setBulkResult] = useState(null);

  useEffect(() => {
    api.get('/admin/settings', token).then(setSettings).catch(() => {});
    api.get('/admin/schools', token).then((data) => setSchools(data)).catch(() => {});
  }, [token]);

  const save = async () => {
    await api.put('/admin/settings', settings, token);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const createUser = async () => {
    if (!newUser.name || !newUser.role || !newUser.school_id) return alert('Name, role, and school are required.');
    try {
      const body = { ...newUser };
      if (singlePassword.trim()) body.password = singlePassword.trim();
      const res = await api.post('/admin/add-pupil', body, token);
      setCreatedUser(res);
      setNewUser({ name: '', email: '', role: 'student', school_id: '' });
      alert('User created! Temporary password: ' + res.temp_password);
    } catch (e) {
      alert(e.message);
    }
  };

  const createBulkUsers = async () => {
    if (!bulkNames.trim() || !newUser.school_id) return alert('Enter student names and select a school.');
    try {
      const body = {
        names: bulkNames,
        role: 'student',
        school_id: newUser.school_id,
      };
      if (bulkPassword.trim()) body.password = bulkPassword.trim();
      const res = await api.post('/admin/add-pupils', body, token);
      setBulkResult(res);
      setBulkNames('');
      alert(`Created ${res.created.length} student account(s).`);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <section className="admin-card" style={{ maxWidth: 560 }}>
        <h2 className="admin-section-title" style={{ marginBottom: '1.5rem' }}>Platform Settings</h2>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Platform Name</label>
          <input className="admin-input" value={settings.platform_name || ''} onChange={(e) => setSettings((s) => ({ ...s, platform_name: e.target.value }))} />
          <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Logo URL</label>
          <input className="admin-input" value={settings.logo_url || ''} onChange={(e) => setSettings((s) => ({ ...s, logo_url: e.target.value }))} />
          <button type="button" className="btn-sm btn-primary" onClick={save}>Save Settings</button>
          {saved && <span style={{ color: '#16a34a' }}>Saved!</span>}
        </section>
      </section>

      <section className="admin-card" style={{ maxWidth: 560 }}>
        <h2 className="admin-section-title">Create User Account</h2>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Leave email empty for auto schoolname.edu address.</p>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input className="admin-input" placeholder="Full name *" value={newUser.name} onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))} />
          <input className="admin-input" placeholder="Email (optional)" value={newUser.email} onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))} />
          <select className="admin-input" value={newUser.role} onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
          <select className="admin-input" value={newUser.school_id} onChange={(e) => setNewUser((u) => ({ ...u, school_id: e.target.value }))}>
            <option value="">Select school *</option>
            {schools.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          <input
            className="admin-input"
            type="password"
            placeholder="Password (optional — same for this student)"
            value={singlePassword}
            onChange={(e) => setSinglePassword(e.target.value)}
          />
          <button type="button" className="btn-sm btn-primary" onClick={createUser}>Create user</button>

          <section style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
            <h3>Bulk create students</h3>
            <textarea className="admin-input" style={{ width: '100%', minHeight: 120 }} value={bulkNames} onChange={(e) => setBulkNames(e.target.value)} />
            <input
              className="admin-input"
              type="password"
              placeholder="Same password for all students (optional)"
              value={bulkPassword}
              onChange={(e) => setBulkPassword(e.target.value)}
            />
            <button type="button" className="btn-sm btn-primary" onClick={createBulkUsers}>Create many students</button>
            {bulkResult?.created?.map((row) => (
              <p key={row.user.id}>{row.user.name} — {row.user.email} (pass: {row.temp_password})</p>
            ))}
          </section>

          {createdUser && (
            <section style={{ padding: '1rem', background: '#f0fdf4', borderRadius: 8 }}>
              {createdUser.user.name} — {createdUser.user.email} — temp: {createdUser.temp_password}
            </section>
          )}
        </section>
      </section>
    </section>
  );
}
