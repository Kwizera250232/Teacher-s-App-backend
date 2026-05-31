import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import '../../pages/ParentHub.css';

export default function SchoolHubPanel({ token, isHeadTeacher }) {
  const [school, setSchool] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState({
    title: '', body: '', district: '', sector: '', welcome_message: '',
    also_email: false, is_pinned: false,
  });
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get('/parent/school/announcements', token).then(setAnnouncements).catch(() => {});
    if (isHeadTeacher) {
      api.get('/parent/school/profile', token).then(setSchool).catch(() => {});
    }
  };

  useEffect(() => { load(); }, [token, isHeadTeacher]);

  const saveProfile = async () => {
    try {
      await api.put('/parent/school/profile', {
        district: form.district || school?.district,
        sector: form.sector || school?.sector,
        welcome_message: form.welcome_message ?? school?.welcome_message,
      }, token);
      setMsg('School profile updated.');
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const postAnnouncement = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/parent/school/announcements', {
        title: form.title,
        body: form.body,
        notify_parents: true,
        also_email: form.also_email,
        is_pinned: form.is_pinned,
      }, token);
      setForm((f) => ({ ...f, title: '', body: '' }));
      setMsg(
        r.parents_notified != null
          ? `Sent to ${r.parents_notified} parent(s) in the app.${r.emails_sent ? ` Email: ${r.emails_sent}.` : ''}`
          : 'Announcement published.'
      );
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  useEffect(() => {
    if (school) {
      setForm((f) => ({
        ...f,
        district: school.district || '',
        sector: school.sector || '',
        welcome_message: school.welcome_message || '',
      }));
    }
  }, [school]);

  return (
    <div className="phub-panel" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>School communication</h2>
        <Link to="/messages" className="btn btn-secondary btn-sm">💬 Open chats</Link>
      </div>

      {isHeadTeacher && school && (
        <div className="phub-card" style={{ marginTop: 12 }}>
          <h3>School profile (shown to parents)</h3>
          <div className="form-group">
            <label>District</label>
            <input value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Sector</label>
            <input value={form.sector} onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Welcome message</label>
            <textarea
              rows={2}
              value={form.welcome_message}
              onChange={(e) => setForm((f) => ({ ...f, welcome_message: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveProfile}>Save</button>
        </div>
      )}

      <form onSubmit={postAnnouncement} className="phub-card" style={{ marginTop: 12 }}>
        <h3>School announcement</h3>
        <input
          className="admin-input"
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
          style={{ width: '100%', marginBottom: 8 }}
        />
        <textarea
          placeholder="Message to all parents…"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          required
          rows={3}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={form.is_pinned}
            onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
          />
          Pin at top for parents
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={form.also_email}
            onChange={(e) => setForm((f) => ({ ...f, also_email: e.target.checked }))}
          />
          Also send email (if SMTP is configured)
        </label>
        <button type="submit" className="btn btn-primary btn-sm">Publish & notify parents</button>
      </form>

      {msg && <p style={{ color: '#059669', fontSize: 14 }}>{msg}</p>}

      <h3 style={{ marginTop: 16 }}>Recent announcements</h3>
      {announcements.length === 0 ? (
        <p className="phub-muted">None yet.</p>
      ) : announcements.slice(0, 5).map((a) => (
        <div key={a.id} className={`phub-card ${a.is_pinned ? 'phub-pinned' : ''}`}>
          {a.is_pinned && <small style={{ color: '#b45309' }}>📌 Pinned</small>}
          <strong>{a.title}</strong>
          <p>{a.body}</p>
        </div>
      ))}
    </div>
  );
}
