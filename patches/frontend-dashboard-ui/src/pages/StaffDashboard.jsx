import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import CreateClassModal from '../components/CreateClassModal';
import AddStudentsModal from '../components/AddStudentsModal';
import SchoolRequestBanner from '../components/SchoolRequestBanner';
import SchoolRequestsPanel from '../components/SchoolRequestsPanel';
import VerifiedBadge from '../components/VerifiedBadge';
import UmunsiAiModal from '../components/UmunsiAiModal';
import StaffQuickActions from '../components/StaffQuickActions';
import SchoolHubPanel from '../components/staff/SchoolHubPanel';
import AddTeacherModal from '../components/staff/AddTeacherModal';
import NotifyParentsModal from '../components/staff/NotifyParentsModal';
import ParentInvitesPickerModal from '../components/ParentInvitesPickerModal';
import StaffChatsPanel from '../components/staff/StaffChatsPanel';
import WeeklyDigestModal from '../components/staff/WeeklyDigestModal';
import StaffCompositionStatusModal from '../components/StaffCompositionStatusModal';
import MobileStaffHeader from '../components/MobileStaffHeader';
import DonateButton from '../components/DonateButton';
import './Dashboard.css';
import './ParentHub.css';
import './MobileDashboard.css';

export default function StaffDashboard({ roleLabel, basePath }) {
  const { user, token, logout, isImpersonating, stopImpersonation } = useAuth();
  const [classes, setClasses] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddStudents, setShowAddStudents] = useState(false);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => JSON.parse(localStorage.getItem('dismissed_announcements') || '[]'));
  const [aiModal, setAiModal] = useState(null);
  const [unread, setUnread] = useState(0);
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [showNotifyParents, setShowNotifyParents] = useState(false);
  const [showParentInvites, setShowParentInvites] = useState(false);
  const [showCompositionStatus, setShowCompositionStatus] = useState(false);
  const [hubTab, setHubTab] = useState('classes');
  const [showWeeklyDigest, setShowWeeklyDigest] = useState(false);
  const isHeadTeacher = roleLabel === 'Head Teacher';
  const hasSchool = Boolean(user?.school_id);

  const dismissAnnouncement = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem('dismissed_announcements', JSON.stringify(updated));
  };

  const loadClasses = () => {
    api.get('/classes', token).then(data => {
      setClasses(data);
      try { localStorage.setItem('cached_staff_classes', JSON.stringify(data)); } catch {}
    }).catch(e => {
      if (!navigator.onLine) {
        try { const c = JSON.parse(localStorage.getItem('cached_staff_classes') || '[]'); setClasses(c); } catch {}
      } else {
        setError(e.message);
      }
    });
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => {
    if (!isHeadTeacher && hubTab === 'school') setHubTab('classes');
  }, [isHeadTeacher, hubTab]);
  useEffect(() => {
    api.get('/admin/user-announcements', token).then(setAnnouncements).catch(() => {});
  }, []);
  useEffect(() => {
    api.get('/messages/unread-count', token).then(r => setUnread(r.count)).catch(() => {});
  }, []);

  const navTabs = [
    { id: 'classes', label: '📚 Classes' },
    ...(isHeadTeacher ? [{ id: 'school', label: '🏫 School' }] : []),
    ...(hasSchool ? [{ id: 'chats', label: '💬 Chats' }] : []),
  ];

  return (
    <div className="dashboard staff-hub-page">
      <header className="dash-header">
        <div className="dash-brand">
          <span className="phub-logo">UClass</span>
          <span className="phub-sub" style={{ marginLeft: 8, fontSize: 13, color: '#888' }}>{roleLabel}</span>
        </div>
        <MobileStaffHeader
          user={user}
          roleLabel={roleLabel}
          onLogout={logout}
          isImpersonating={isImpersonating}
          stopImpersonation={stopImpersonation}
        />
        <div className="dash-user">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            👋 {user?.name}
            <VerifiedBadge size={15} info={{ items: [
              { icon: '👨‍🏫', label: 'Role', value: roleLabel },
              { icon: '📧', label: 'Email', value: user?.email },
            ] }} />
          </span>
          {isImpersonating && (
            <button className="btn btn-secondary btn-sm" onClick={stopImpersonation}>↩ Return Admin</button>
          )}
          <Link to="/messages" className="btn btn-secondary btn-sm" style={{ position: 'relative' }}>
            💬 Messages{unread > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: 11, fontWeight: 700, padding: '1px 6px', marginLeft: 4 }}>{unread}</span>}
          </Link>
          <DonateButton />
          <Link to="/profile" className="btn btn-secondary btn-sm">👤 Profile</Link>
          <button className="btn btn-outline" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="mobile-donate-fab">
        <DonateButton compact fab />
      </div>

      <nav className="phub-nav staff-hub-nav">
        {navTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`phub-nav-btn ${hubTab === t.id ? 'active' : ''}`}
            onClick={() => setHubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="dash-main">
        <SchoolRequestBanner token={token} user={user} />
        {isHeadTeacher && hubTab === 'school' && <SchoolRequestsPanel token={token} />}

        {error && <div className="alert alert-error">{error}</div>}

        {hubTab === 'school' && hasSchool && (
          <SchoolHubPanel token={token} isHeadTeacher={isHeadTeacher} />
        )}
        {hubTab === 'school' && !hasSchool && user?.role === 'teacher' && (
          <p className="phub-muted">Join a school from the banner above before posting announcements.</p>
        )}

        {hubTab === 'chats' && hasSchool && (
          <div className="wa-theme staff-chats-wrap">
            <StaffChatsPanel token={token} />
          </div>
        )}
        {hubTab === 'chats' && !hasSchool && (
          <p className="phub-muted">Link to a school to message parents.</p>
        )}

        {hubTab === 'classes' && (
          <>
            <div className="dash-top dash-top--staff-actions">
              <div>
                <h1 style={{ fontSize: 22, marginBottom: 4 }}>Your classes</h1>
                <p className="dash-sub">Manage classes, students, and parent links</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  + Fungura Ishuri
                </button>
                <button className="btn btn-secondary" onClick={() => setShowAddStudents(true)} disabled={user?.role === 'teacher' && !hasSchool}>
                  👤 Add Students
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowParentInvites(true)}>
                  👪 Parent invites
                </button>
              </div>
            </div>

            <section className="staff-apps-panel" aria-label="Teacher tools">
              <StaffQuickActions
                token={token}
                onAddStudents={() => setShowAddStudents(true)}
                onParentInvites={() => setShowParentInvites(true)}
              />
              <div className="staff-apps-grid">
                <Link to="/messages" className="staff-app-tile">
                  💬 Messages{unread > 0 ? ` (${unread})` : ''}
                </Link>
                <button type="button" className="staff-app-tile" onClick={() => setShowNotifyParents(true)}>
                  📢 Notify parents
                </button>
                {classes[0] && (
                  <>
                    <button
                      type="button"
                      className="staff-app-tile"
                      onClick={() => setAiModal({ classId: classes[0].id, className: classes[0].name })}
                    >
                      🎓 Umunsi AI
                    </button>
                    <Link to={`${basePath}/classes/${classes[0].id}/record-marks`} className="staff-app-tile">
                      📊 CAT Marks
                    </Link>
                    <button type="button" className="staff-app-tile" onClick={() => setShowWeeklyDigest(true)}>
                      📊 Weekly digest
                    </button>
                  </>
                )}
                {isHeadTeacher && (
                  <button type="button" className="staff-app-tile" onClick={() => setShowAddTeacher(true)}>
                    👨‍🏫 Add teacher
                  </button>
                )}
              </div>
            </section>

            {announcements.filter(a => !dismissed.includes(a.id)).map(a => (
              <div key={a.id} className="staff-announce-card">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span>📢</span>
                    <strong style={{ color: '#1e40af', fontSize: '0.95rem' }}>{a.title}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>— {a.admin_name}</span>
                  </div>
                  <p style={{ margin: 0, color: '#374151', fontSize: '0.9rem' }}>{a.message}</p>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => dismissAnnouncement(a.id)}
                  className="staff-announce-dismiss"
                  title="Dismiss"
                >✕</button>
              </div>
            ))}

            {classes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📚</div>
                <h3>Nta madarasa</h3>
                <p>Fungura ishuri ryawe rya mbere utangire</p>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Fungura Ishuri</button>
              </div>
            ) : (
              <div className="classes-grid">
                {classes.map(cls => (
                  <Link key={cls.id} to={`${basePath}/classes/${cls.id}`} className="class-card">
                    <div className="class-card-header">
                      <h3>{cls.name}</h3>
                      {cls.subject && <span className="subject-tag">{cls.subject}</span>}
                    </div>
                    <div className="class-code-display">
                      <span className="code-label">Class code</span>
                      <span className="code-value">{cls.class_code}</span>
                    </div>
                    <p className="class-teacher">👥 {cls.student_count ?? 0} students</p>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <div className="mobile-staff-quick-bar">
        <button type="button" onClick={() => { setHubTab('classes'); setShowAddStudents(true); }}>
          👥 Students
        </button>
        <button type="button" onClick={() => setShowCompositionStatus(true)} disabled={!hasSchool}>
          ✍️ C. Status
        </button>
        <button type="button" onClick={() => setShowParentInvites(true)}>
          👪 Parent invite
        </button>
      </div>

      {showCreate && (
        <CreateClassModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadClasses(); }}
        />
      )}

      {showAddStudents && (
        <AddStudentsModal
          token={token}
          onClose={() => setShowAddStudents(false)}
          onNeedJoinSchool={() => {
            setShowAddStudents(false);
            setHubTab('classes');
            setTimeout(() => {
              document.getElementById('school-join-banner')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }}
        />
      )}

      {aiModal && (
        <UmunsiAiModal
          classId={aiModal.classId}
          className={aiModal.className}
          token={token}
          isTeacher={true}
          onClose={() => setAiModal(null)}
        />
      )}

      {showAddTeacher && (
        <AddTeacherModal
          token={token}
          onClose={() => setShowAddTeacher(false)}
          onCreated={() => setShowAddTeacher(false)}
        />
      )}

      {showNotifyParents && (
        <NotifyParentsModal
          token={token}
          classId={classes[0]?.id}
          onClose={() => setShowNotifyParents(false)}
        />
      )}

      {showParentInvites && (
        <ParentInvitesPickerModal
          token={token}
          onClose={() => setShowParentInvites(false)}
        />
      )}

      {showWeeklyDigest && classes[0]?.id && (
        <WeeklyDigestModal
          token={token}
          classId={classes[0].id}
          onClose={() => setShowWeeklyDigest(false)}
          onSent={() => setShowWeeklyDigest(false)}
        />
      )}

      {showCompositionStatus && hasSchool && (
        <StaffCompositionStatusModal
          token={token}
          schoolWide
          onClose={() => setShowCompositionStatus(false)}
        />
      )}
    </div>
  );
}
