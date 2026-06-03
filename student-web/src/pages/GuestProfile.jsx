import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import GuestShell from '../components/GuestShell';
import DonateSupportBanner from '../components/DonateSupportBanner';
import './Profile.css';
import './GuestDashboard.css';

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23128c7e'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

export default function GuestProfile() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    api
      .get('/guest/profile', token)
      .then((p) => {
        setProfile(p);
        setPhone(p.phone || '');
        setAvatarUrl(p.avatar_path ? `${UPLOADS_BASE}${p.avatar_path}?v=${Date.now()}` : '');
      })
      .catch(() => {
        api.get('/profile/me', token).then((p) => {
          setProfile(p);
          setPhone(p.phone || '');
          setAvatarUrl(p.avatar_path ? `${UPLOADS_BASE}${p.avatar_path}?v=${Date.now()}` : '');
        });
      });
  }, [token]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const res = await uploadFile('/profile/me/avatar', fd, token);
      setAvatarUrl(`${UPLOADS_BASE}${res.avatar_path}?v=${Date.now()}`);
      setMsg('Photo updated.');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api.put('/profile/me', { phone: phone.trim() || null }, token);
      setMsg('Profile saved.');
      setEditMode(false);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GuestShell title="My profile">
      <DonateSupportBanner compact />

      <div className="profile-view-card" style={{ marginTop: 16 }}>
        <div className="profile-view-avatar-wrap">
          <img
            src={avatarUrl || DEFAULT_AVATAR}
            alt=""
            className="profile-view-avatar"
            onError={() => setAvatarUrl('')}
          />
          <button
            type="button"
            className="avatar-edit-btn-overlay"
            onClick={() => fileRef.current?.click()}
          >
            📷
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
        </div>

        <div className="profile-view-name-row">
          <span className="profile-name">{user?.name}</span>
          <span className="profile-role-badge">guest</span>
        </div>
        <div className="profile-email">✉️ {user?.email}</div>

        <div className="profile-stats-bar">
          <div className="profile-stat">
            <strong>{profile?.quizzes_taken ?? 0}</strong>
            <span>Quizzes taken</span>
          </div>
          <div className="profile-stat">
            <strong>{profile?.classes_unlocked ?? 0}</strong>
            <span>Classes unlocked</span>
          </div>
        </div>

        <div
          style={{
            background: '#f8fafc',
            borderRadius: 10,
            padding: 12,
            marginTop: 16,
            fontSize: 13,
            color: '#475569',
            lineHeight: 1.5,
          }}
        >
          Guest accounts use <strong>@guest.umunsi.com</strong> email. You can view shared class
          materials and take quizzes, but you are not enrolled as a student (no class roster,
          leaderboard, or private student features).
        </div>

        {msg && (
          <p style={{ marginTop: 12, fontSize: 13, color: msg.includes('error') ? '#dc2626' : '#166534' }}>
            {msg}
          </p>
        )}

        {!editMode ? (
          <div style={{ marginTop: 16 }}>
            {phone && (
              <p style={{ fontSize: 14 }}>
                📞 <strong>{phone}</strong>
              </p>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditMode(true)}>
              Edit phone
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ marginTop: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
              Phone (optional)
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: '100%', marginTop: 6, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-full" onClick={() => navigate('/guest/dashboard')}>
            ← Guest home
          </button>
          <button type="button" className="btn btn-danger btn-full" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </GuestShell>
  );
}
