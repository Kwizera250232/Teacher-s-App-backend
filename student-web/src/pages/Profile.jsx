
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, uploadFile, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import './Profile.css';
import StudentShareFeed from '../components/StudentShareFeed';
import DonateSupportBanner from '../components/DonateSupportBanner';
import '../components/StudentShareFeed.css';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23667eea'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

function TagInput({ label, values, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  };
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="tag-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={add}>Add</button>
      </div>
      <div className="tags">
        {values.map((v, i) => (
          <span key={i} className="tag">
            {v}
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}>Ã—</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function MyRepostsSection({ userId }) {
  const [reposts, setReposts] = useState([]);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    const key = `my_reposts_${userId}`;
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    setReposts(stored);
  }, [userId]);

  const removeRepost = (id) => {
    const key = `my_reposts_${userId}`;
    const updated = reposts.filter(r => r.id !== id);
    setReposts(updated);
    localStorage.setItem(key, JSON.stringify(updated));
  };

  if (reposts.length === 0) return null;

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        📌 My Reposts / Classworks
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reposts.map(r => (
          <div key={r.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <strong style={{ fontSize: 14 }}>{r.author_name}</strong>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{r.author_role} · {r.post_type}</span>
              </div>
              <button
                onClick={() => removeRepost(r.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 0 }}
                title="Remove from reposts"
              >✕</button>
            </div>
            {r.classwork_summary && (
              <p style={{ fontSize: 13, color: '#2563eb', fontWeight: 600, marginBottom: 4 }}>Classwork: {r.classwork_summary}</p>
            )}
            {r.body && (
              <div>
                {expanded[r.id] ? (
                  <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {r.body}
                    <button
                      type="button"
                      onClick={() => setExpanded(e => ({ ...e, [r.id]: false }))}
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginLeft: 6 }}
                    >Show less</button>
                  </p>
                ) : (
                  <p style={{ fontSize: 14, color: '#374151' }}>
                    {r.body.length > 120 ? r.body.split('\n')[0].slice(0, 120) + '…' : r.body}
                    {r.body.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setExpanded(e => ({ ...e, [r.id]: true }))}
                        style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginLeft: 6 }}
                      >Read more</button>
                    )}
                  </p>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              Saved {new Date(r.reposted_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeacherUserCreation({ token }) {
  const { user, updateUser } = useAuth();
  const [schools, setSchools] = useState([]);
  const [linkedSchoolId, setLinkedSchoolId] = useState(user?.school_id != null ? String(user.school_id) : '');
  const [linkedSchoolName, setLinkedSchoolName] = useState('');
  const [schoolReady, setSchoolReady] = useState(false);
  const [schoolError, setSchoolError] = useState('');
  const [showNewSchool, setShowNewSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'student', school_id: '' });
  const [createdUser, setCreatedUser] = useState(null);
  const [bulkNames, setBulkNames] = useState('');
  const [password, setPassword] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const teacherNeedsSchool = user?.role === 'teacher' && schoolReady && !linkedSchoolId;
  const canPickSchool = !linkedSchoolId || user?.role === 'admin' || user?.role === 'head_teacher';
  const effectiveSchoolId = newUser.school_id || linkedSchoolId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let activeSchoolId = user?.school_id != null ? String(user.school_id) : '';
      try {
        const me = await api.get('/auth/me', token);
        const sid = me?.user?.school_id;
        if (!cancelled && sid != null) {
          activeSchoolId = String(sid);
          setLinkedSchoolId(activeSchoolId);
          setNewUser((u) => ({ ...u, school_id: activeSchoolId }));
          if (user && String(user.school_id || '') !== activeSchoolId) {
            updateUser({ ...user, school_id: sid });
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const data = await api.get('/auth/schools', token);
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setSchools(list);
        if (activeSchoolId) {
          const mySchool = list.find((s) => String(s.id) === activeSchoolId);
          if (mySchool) setLinkedSchoolName(mySchool.name);
        } else if (!list.length) {
          setSchoolError('No schools found. Add a new school below.');
        }
      } catch (e) {
        if (!cancelled) {
          setSchools([]);
          setSchoolError(e.message || 'Could not load schools.');
        }
      } finally {
        if (!cancelled) setSchoolReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) return;
    setLoading(true);
    setSchoolError('');
    try {
      const created = await api.post('/auth/schools', { name: newSchoolName.trim() }, token);
      setSchools((prev) => [...prev, created]);
      const newId = String(created.id);
      setNewUser((u) => ({ ...u, school_id: newId }));
      if (!linkedSchoolId) setLinkedSchoolName(created.name || newSchoolName.trim());
      setShowNewSchool(false);
      setNewSchoolName('');
    } catch (e) {
      setSchoolError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const createUser = async () => {
    if (!newUser.name || !newUser.role || !effectiveSchoolId) {
      alert('Name, role, and school are required.');
      return;
    }
    setLoading(true);
    try {
      const body = { ...newUser, school_id: effectiveSchoolId };
      if (password.trim()) body.password = password.trim();
      const res = await api.post('/admin/add-pupil', body, token);
      setCreatedUser(res);
      setNewUser({ name: '', email: '', role: 'student', school_id: linkedSchoolId || effectiveSchoolId });
      setPassword('');
      alert('User created! Temporary password: ' + res.temp_password);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'white', padding: '20px', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      {teacherNeedsSchool && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          Your account is not linked to a school yet. Join a school from your dashboard, or add a new school below (head teacher / admin).
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <div className="form-group">
          <label style={{ fontSize: '14px', fontWeight: 600 }}>Full Name *</label>
          <input
            className="profile-input"
            value={newUser.name}
            onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
            placeholder="Enter full name"
          />
        </div>
        <div className="form-group">
          <label style={{ fontSize: '14px', fontWeight: 600 }}>Email (optional)</label>
          <input
            className="profile-input"
            value={newUser.email}
            onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
            placeholder="name@brightschool.edu"
          />
        </div>
        <div className="form-group">
          <label style={{ fontSize: '14px', fontWeight: 600 }}>Role *</label>
          <select
            className="profile-input"
            value={newUser.role}
            onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>
        <div className="form-group">
          <label style={{ fontSize: '14px', fontWeight: 600 }}>
            School *
            {linkedSchoolName && (
              <span style={{ fontWeight: 400, color: '#16a34a', marginLeft: 8, fontSize: 12 }}>
                (Your school: {linkedSchoolName})
              </span>
            )}
          </label>
          {linkedSchoolId && !canPickSchool ? (
            <input className="profile-input" readOnly value={linkedSchoolName || 'Your school'} style={{ background: '#f8fafc' }} />
          ) : !showNewSchool ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                className="profile-input"
                style={{ flex: 1, minWidth: 160 }}
                value={effectiveSchoolId}
                onChange={e => setNewUser(u => ({ ...u, school_id: e.target.value }))}
              >
                <option value="">Select School</option>
                {schools.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewSchool(true)}>
                + New school
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="profile-input"
                style={{ flex: 1, minWidth: 160 }}
                placeholder="New school name"
                value={newSchoolName}
                onChange={e => setNewSchoolName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateSchool()}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateSchool} disabled={loading}>
                Add
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowNewSchool(false); setNewSchoolName(''); }}>
                Cancel
              </button>
            </div>
          )}
          {schoolError && <small style={{ color: '#dc2626', display: 'block', marginTop: 6 }}>{schoolError}</small>}
        </div>
        <div className="form-group">
          <label style={{ fontSize: '14px', fontWeight: 600 }}>Password (optional)</label>
          <input
            className="profile-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Same password for this account (min 4 chars)"
          />
        </div>
      </div>

      <button className="btn btn-primary" onClick={createUser} disabled={loading || teacherNeedsSchool}>
        {loading ? 'Creating...' : '+ Create User'}
      </button>

      <section style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Bulk create students</h3>
        <textarea
          className="profile-input"
          style={{ width: '100%', minHeight: 100 }}
          placeholder="One student name per line"
          value={bulkNames}
          onChange={(e) => setBulkNames(e.target.value)}
        />
        <input
          className="profile-input"
          type="password"
          style={{ marginTop: 8 }}
          placeholder="Same password for all students (optional)"
          value={bulkPassword}
          onChange={(e) => setBulkPassword(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          disabled={loading || teacherNeedsSchool}
          onClick={async () => {
            if (!bulkNames.trim() || !effectiveSchoolId) return alert('Enter names and select a school.');
            setLoading(true);
            try {
              const body = { names: bulkNames, role: 'student', school_id: effectiveSchoolId };
              if (bulkPassword.trim()) body.password = bulkPassword.trim();
              const res = await api.post('/admin/add-pupils', body, token);
              setBulkNames('');
              setBulkPassword('');
              alert(`Created ${res.created.length} student(s).`);
            } catch (e) {
              alert(e.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          Create many students
        </button>
      </section>

      {createdUser && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
          <strong>User created</strong><br />
          Name: {createdUser.user.name}<br />
          Email: {createdUser.user.email}<br />
          Temp Password: <code>{createdUser.temp_password}</code><br />
          <small>Share the password securely with the user.</small>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileRef = useRef();

  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [editMode, setEditMode] = useState(false);

  // form fields
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [schools, setSchools] = useState([]);
  const [dreams, setDreams] = useState('');
  const [favLessons, setFavLessons] = useState([]);
  const [hobbies, setHobbies] = useState([]);
  const [fears, setFears] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    if (searchParams.get('compose') === 'composition' && user?.role === 'student') {
      const t = setTimeout(() => {
        document.querySelector('.profile-share-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [searchParams, user?.role]);

  useEffect(() => {
    api.get('/profile/me', token).then(p => {
      setProfile(p);
      setPhone(p.phone || '');
      setAddress(p.home_address || '');
      setSchools(tryParse(p.schools, []));
      setDreams(p.dreams || '');
      setFavLessons(tryParse(p.favorite_lessons, []));
      setHobbies(tryParse(p.hobbies, []));
      setFears(p.fears || '');
      setAvatarUrl(p.avatar_path ? `${UPLOADS_BASE}${p.avatar_path}?v=${Date.now()}` : '');
      setSubscriberCount(p.subscriber_count || 0);
      setFollowingCount(p.following_count || 0);
    }).catch(() => {});
  }, [token]);

  function tryParse(val, fallback) {
    try { return JSON.parse(val) || fallback; } catch { return fallback; }
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const res = await uploadFile('/profile/me/avatar', fd, token);
      setAvatarUrl(`${UPLOADS_BASE}${res.avatar_path}?v=${Date.now()}`);
      setMsg('Profile picture updated!');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (hobbies.length < 2) return setMsg('Please add at least 2 hobbies.');
    setSaving(true);
    setMsg('');
    try {
      await api.put('/profile/me', {
        phone, home_address: address, schools,
        dreams, favorite_lessons: favLessons, hobbies, fears,
      }, token);
      setMsg('Profile saved successfully!');
      setEditMode(false);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ”€”€ View Mode ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
  if (!editMode) {
    return (
      <div className="profile-page">
        <div className="profile-header">
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>← Back</button>
          <h1>My Profile</h1>
          <button className="btn btn-primary btn-sm" onClick={() => setEditMode(true)}>✏️ Edit</button>
        </div>

        <DonateSupportBanner compact />

        <div className="profile-view-card">
          {/* Avatar + change photo */}
          <div className="profile-view-avatar-wrap">
            <img
              key={avatarUrl}
              src={avatarUrl || DEFAULT_AVATAR}
              alt="avatar"
              className="profile-view-avatar"
              onError={() => setAvatarUrl('')}
            />
            <button type="button" className="avatar-edit-btn-overlay" onClick={() => fileRef.current?.click()}>
              📷
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </div>

          {/* Name + role + badge */}
          <div className="profile-view-name-row">
            <span className="profile-name">{user?.name}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="12" fill="#1d9bf0"/>
              <path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="profile-role-badge">{user?.role}</span>
          </div>
          <div className="profile-email">✉️ {user?.email}</div>

          {/* Stats */}
          <div className="profile-stats-bar">
            <div className="profile-stat">
              <strong>{subscriberCount}</strong>
              <span>Subscribers</span>
            </div>
          </div>

          {/* Personal info */}
          {(phone || address || schools.length > 0) && (
            <div className="profile-view-section">
              <div className="profile-view-section-title">📋 Personal Info</div>
              {phone && <div className="profile-view-row"><span>📞</span><span>{phone}</span></div>}
              {address && <div className="profile-view-row"><span>🏠</span><span>{address}</span></div>}
              {schools.length > 0 && (
                <div className="profile-view-row">
                  <span>🏫</span>
                  <div className="profile-view-tags">
                    {schools.map((s, i) => <span key={i} className="profile-view-tag">{s}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* About me */}
          {(dreams || favLessons.length > 0 || hobbies.length > 0 || fears) && (
            <div className="profile-view-section">
              <div className="profile-view-section-title">✨ About Me</div>
              {dreams && (
                <div className="profile-view-block">
                  <div className="profile-view-label">🌟 Dreams</div>
                  <p className="profile-view-text">{dreams}</p>
                </div>
              )}
              {favLessons.length > 0 && (
                <div className="profile-view-block">
                  <div className="profile-view-label">📚 Favorite Lessons</div>
                  <div className="profile-view-tags">
                    {favLessons.map((l, i) => <span key={i} className="profile-view-tag">{l}</span>)}
                  </div>
                </div>
              )}
              {hobbies.length > 0 && (
                <div className="profile-view-block">
                  <div className="profile-view-label">🎯 Hobbies</div>
                  <div className="profile-view-tags">
                    {hobbies.map((h, i) => <span key={i} className="profile-view-tag">{h}</span>)}
                  </div>
                </div>
              )}
              {fears && (
                <div className="profile-view-block">
                  <div className="profile-view-label">😰 What I Fear</div>
                  <p className="profile-view-text">{fears}</p>
                </div>
              )}
            </div>
          )}

          {!profile && <p style={{ textAlign: 'center', color: '#aaa', padding: '20px 0' }}>Loading profile...</p>}
          {profile && !phone && !dreams && schools.length === 0 && (
            <div className="profile-view-empty">
              <p>Your profile is empty.</p>
              <button className="btn btn-primary" onClick={() => setEditMode(true)}>✏️ Fill your profile</button>
            </div>
          )}

          {msg && <div className={`profile-msg ${msg.includes('success') || msg.includes('updated') ? 'success' : 'error'}`}>{msg}</div>}
        </div>

        {/* User Creation for Teachers */}
        {(user?.role === 'teacher' || user?.role === 'head_teacher' || user?.role === 'admin') && (
          <div className="profile-teacher-section">
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#1e40af' }}>👤 Create Student/Teacher Account</h2>
            <p style={{ color: '#64748b', marginBottom: 20 }}>
              Create accounts for students or teachers. Leave email empty to auto-generate a school address, or enter one that matches your school domain.
            </p>
            <TeacherUserCreation token={token} />
          </div>
        )}

        {/* My Reposts / Classworks – students only */}
        {user?.role === 'student' && <MyRepostsSection userId={user?.id} />}

        {/* Share feed – students only */}
        {user?.role === 'student' && (
          <div className="profile-share-section">
            <h2 style={{ textAlign: 'center', fontWeight: 700, fontSize: 22, marginBottom: 6, color: '#2563eb' }}>
              📚 Share Your Knowledge with Classmates
            </h2>
            <p style={{ textAlign: 'center', color: '#64748b', marginBottom: 20, fontSize: 15 }}>
              Teach what you know, share what you learned, inspire others. Only your subscribers can see your posts.
            </p>
            <StudentShareFeed token={token} />
          </div>
        )}

        {/* Umunsimedia promo */}
        <div className="umunsimedia-promo">
          <a href="https://umunsimedia.com" target="_blank" rel="noreferrer" className="umunsimedia-link">
            <div className="umunsimedia-inner">
              <div className="umunsimedia-text">
                <span className="umunsimedia-tagline">Want to increase your writing knowledge?</span>
                <span className="umunsimedia-cta">Visit Umunsimedia.com →</span>
              </div>
            </div>
          </a>
        </div>
      </div>
    );
  }

  // ”€”€ Edit Mode ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="btn btn-outline btn-sm" onClick={() => setEditMode(false)}>← Cancel</button>
        <h1>Edit Profile</h1>
      </div>

      <form className="profile-form" onSubmit={handleSave}>
        {/* Avatar */}
        <div className="profile-avatar-wrap">
          <img
            src={avatarUrl || DEFAULT_AVATAR}
            alt="avatar"
            className="profile-avatar"
            key={avatarUrl}
            onClick={() => fileRef.current?.click()}
            onError={() => setAvatarUrl('')}
          />
          <button type="button" className="avatar-edit-btn" onClick={() => fileRef.current?.click()}>
            📷 Change Photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
        </div>

        <div className="profile-name-row">
          <span className="profile-name">{user?.name}</span>
          <span className="profile-role-badge">{user?.role}</span>
        </div>
        <div className="profile-email">✉️ {user?.email}</div>

        <div className="profile-section-title">📋 Personal Info</div>

        <div className="form-group">
          <label>📞 Phone Number</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+250 7XX XXX XXX" />
        </div>

        <div className="form-group">
          <label>🏠 Home Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="District, Sector..." />
        </div>

        <TagInput
          label="🏫 Schools (add all your schools)"
          values={schools}
          onChange={setSchools}
          placeholder="Type school name and press Enter or Add"
        />

        <div className="profile-section-title">✨ About Me</div>

        <div className="form-group">
          <label>🌟 My Dreams</label>
          <textarea value={dreams} onChange={e => setDreams(e.target.value)} placeholder="What do you want to become..." rows={3} />
        </div>

        <TagInput
          label="📚 Favorite Lessons"
          values={favLessons}
          onChange={setFavLessons}
          placeholder="e.g. Mathematics"
        />

        <TagInput
          label="🎯 Hobbies (at least 2)"
          values={hobbies}
          onChange={setHobbies}
          placeholder="e.g. Reading, Football..."
        />

        <div className="form-group">
          <label>😰 What I Fear About</label>
          <textarea value={fears} onChange={e => setFears(e.target.value)} placeholder="Something you struggle with or are afraid of..." rows={3} />
        </div>

        {msg && <div className={`profile-msg ${msg.includes('success') || msg.includes('updated') ? 'success' : 'error'}`}>{msg}</div>}

        <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
          {saving ? 'Saving...' : '💾 Save Profile'}
        </button>
      </form>
    </div>
  );

}
