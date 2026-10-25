import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, UPLOADS_BASE, uploadFile } from '../api';
import { useAuth } from '../context/AuthContext';
import VoiceCall from '../components/VoiceCall';

/** Teacher public profile — same look as the alumni/student profile, works in both apps. */
export default function TeacherPublicProfile() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const isMe = !id || id === 'me' || Number(id) === Number(user?.id);
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [call, setCall] = useState(null);
  const [form, setForm] = useState({ bio: '', current_occupation: '', personal_motto: '', skills: '', favorite_subject: '' });
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const data = await api.get(`/alumni/profile/${isMe ? 'me' : id}`, token);
      setP(data);
      setForm({
        bio: data.bio || '',
        current_occupation: data.current_occupation || '',
        personal_motto: data.personal_motto || '',
        skills: (data.skills || []).join(', '),
        favorite_subject: data.favorite_subject || '',
      });
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [id, token]); // eslint-disable-line

  const staff = ['teacher', 'head_teacher', 'admin'].includes(p?.role);
  const avatar = p?.avatar_url || p?.avatar_path;

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/alumni/profile/me', {
        ...form,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
      }, token);
      setEditing(false);
      load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const uploadAvatar = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await uploadFile('/alumni/profile/avatar', f, token);
      await api.put('/alumni/profile/me', { avatar_url: r.url }, token);
      load();
    } catch (err) { alert(err.message); }
  };

  const callTeacher = async () => {
    try {
      const c = await api.post('/teacher-calls', { callee_id: p.user_id || p.id }, token);
      setCall({ id: c.id });
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Loading profile…</div>;
  if (!p) return <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Profile not found.</div>;

  const initials = (p.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: 40 }}>
      {/* Cover */}
      <div style={{ height: 220, background: 'linear-gradient(135deg,#0e7490,#6366f1)', position: 'relative' }}>
        <button type="button" onClick={() => navigate(-1)} style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(0,0,0,.3)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>← Back</button>
        {isMe && (
          <button type="button" onClick={() => fileRef.current?.click()} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,.35)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>📸 Photo</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
      </div>

      <div style={{ maxWidth: 680, margin: '-70px auto 0', padding: '0 14px' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '76px 20px 24px', boxShadow: '0 4px 20px rgba(0,0,0,.08)', position: 'relative' }}>
          {/* Avatar */}
          <div style={{ position: 'absolute', top: -56, left: '50%', transform: 'translateX(-50%)', width: 112, height: 112, borderRadius: '50%', border: '5px solid #fff', background: `hsl(${(p.user_id || p.id) * 137 % 360},55%,45%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 800, color: '#fff', overflow: 'hidden' }}>
            {avatar ? <img src={avatar.startsWith('http') ? avatar : `${UPLOADS_BASE}${avatar}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>

          <div style={{ textAlign: 'center' }}>
            <h2 style={{ margin: '4px 0 2px', fontSize: 24 }}>{p.name}</h2>
            <div style={{ color: '#64748b', fontSize: 14 }}>
              {p.role === 'head_teacher' ? '🏫 Head Teacher' : p.role === 'teacher' ? '👩‍🏫 Teacher' : p.role === 'alumni' ? '🎓 UClass Alumni' : p.role === 'student' ? '🎓 Student' : p.role}
            </div>
            {(p.school_name || p.school_name_text) && <div style={{ color: '#64748b', fontSize: 14, marginTop: 2 }}>🏫 {p.school_name || p.school_name_text}</div>}
            {(p.district || p.sector) && <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>📍 {[p.district, p.sector].filter(Boolean).join(', ')}</div>}
            {staff && p.email && <a href={`mailto:${p.email}`} style={{ display: 'inline-block', marginTop: 8, color: '#0369a1', fontSize: 13, textDecoration: 'none' }}>✉️ {p.email}</a>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            {isMe ? (
              <button type="button" onClick={() => setEditing((v) => !v)} style={{ padding: '10px 22px', borderRadius: 22, border: '1.5px solid #6366f1', background: editing ? '#6366f1' : '#fff', color: editing ? '#fff' : '#6366f1', fontWeight: 700, cursor: 'pointer' }}>
                {editing ? 'Cancel' : '✏️ Edit Profile'}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => navigate(`/messages?to=${p.user_id || p.id}`)} style={{ padding: '10px 22px', borderRadius: 22, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>💬 Message</button>
                {staff && <button type="button" onClick={callTeacher} style={{ padding: '10px 22px', borderRadius: 22, border: '1.5px solid #16a34a', background: '#fff', color: '#16a34a', fontWeight: 700, cursor: 'pointer' }}>📞 Call</button>}
              </>
            )}
          </div>

          {/* Bio + details */}
          {p.bio && <p style={{ margin: '18px 0 0', lineHeight: 1.7, color: '#334155', fontSize: 15, textAlign: 'center' }}>{p.bio}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
            {p.favorite_subject && <span style={{ background: '#eef2ff', color: '#4f46e5', borderRadius: 16, padding: '5px 12px', fontSize: 13 }}>📚 {p.favorite_subject}</span>}
            {p.current_occupation && <span style={{ background: '#ecfeff', color: '#0e7490', borderRadius: 16, padding: '5px 12px', fontSize: 13 }}>💼 {p.current_occupation}</span>}
            {(p.skills || []).map((s) => <span key={s} style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 16, padding: '5px 12px', fontSize: 13 }}>⭐ {s}</span>)}
            {p.personal_motto && <span style={{ background: '#fdf4ff', color: '#a21caf', borderRadius: 16, padding: '5px 12px', fontSize: 13 }}>💭 “{p.personal_motto}”</span>}
          </div>
          {!p.bio && !isMe && <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: 18 }}>No bio yet.</p>}
        </div>

        {/* Edit form */}
        {editing && (
          <div style={{ background: '#fff', borderRadius: 18, padding: 20, marginTop: 14, boxShadow: '0 4px 20px rgba(0,0,0,.06)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 18 }}>Edit Profile</h3>
            {[
              { k: 'current_occupation', label: 'What I do', ph: 'e.g. P4 English & Kinyarwanda teacher' },
              { k: 'favorite_subject', label: 'Subject I teach', ph: 'e.g. English, Mathematics' },
              { k: 'personal_motto', label: 'My motto', ph: 'A line that inspires your teaching' },
              { k: 'skills', label: 'Skills (comma separated)', ph: 'e.g. lesson planning, Kinyarwanda, CBC' },
            ].map((f) => (
              <div key={f.k} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 5, color: '#334155' }}>{f.label}</label>
                <input value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.ph}
                  style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 5, color: '#334155' }}>Bio</label>
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4}
                style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <button type="button" onClick={save} disabled={saving} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
              {saving ? 'Saving…' : '💾 Save Profile'}
            </button>
          </div>
        )}
      </div>

      {call && <VoiceCall callId={call.id} role="caller" peerName={p.name} peerAvatar={avatar} onClose={() => setCall(null)} />}
    </div>
  );
}
