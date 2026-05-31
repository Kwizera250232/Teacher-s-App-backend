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
import MobileStaffHeader from '../components/MobileStaffHeader';
import MobileBottomBar from '../components/MobileBottomBar';
import DonateButton from '../components/DonateButton';
import './Dashboard.css';
import './ParentHub.css';
import './MobileDashboard.css';
import CompositionStatusList from '../components/CompositionStatusList';

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
    { id: 'tools', label: '⚡ Tools' },
  ];

  return (
    <div className="dashboard staff-hub-page staff-wa-dashboard wa-theme">
      <header className="dash-header phub-header">
        <div className="phub-brand">
          <span className="phub-logo">UClass</span>
          <span className="phub-sub">{roleLabel}</span>
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowParentInvites(true)}>👪 Parent invites</button>
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

      <main className="dash-main wa-chat-screen">
        <SchoolRequestBanner token={token} user={user} />
        {isHeadTeacher && hubTab === 'school' && <SchoolRequestsPanel token={token} />}

        {error && <div className="alert alert-error">{error}</div>}

        {hubTab === 'school' && hasSchool && (
          <>
            <SchoolHubPanel token={token} isHeadTeacher={isHeadTeacher} />
            {isHeadTeacher && (
              <section style={{ marginTop: 20 }}>
                <h2 style={{ fontSize: 17, color: '#075e54', marginBottom: 10 }}>✍️ School — C. Status</h2>
                <CompositionStatusList token={token} schoolWide />
              </section>
            )}
          </>
        )}
        {hubTab === 'school' && !hasSchool && user?.role === 'teacher' && (
          <p className="phub-muted">Join a school from the banner above before posting announcements.</p>
        )}

        {hubTab === 'chats' && hasSchool && <StaffChatsPanel token={token} />}
        {hubTab === 'chats' && !hasSchool && (
          <p className="phub-muted">Link to a school to message parents.</p>
        )}

        {hubTab === 'tools' && (
          <div className="wa-tools-panel">
            {hasSchool && (
              <section style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 17, color: '#075e54', marginBottom: 10 }}>✍️ C. Status (school)</h2>
                <CompositionStatusList token={token} schoolWide />
              </section>
            )}
            <StaffQuickActions
              token={token}
              onAddStudents={() => setShowAddStudents(true)}
              onParentInvites={() => setShowParentInvites(true)}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNotifyParents(true)}>
                📢 Notify parents
              </button>
              {isHeadTeacher && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddTeacher(true)}>
                  👨‍🏫 Add teacher
                </button>
              )}
              {classes[0]?.id && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowWeeklyDigest(true)}>
                  📊 Weekly behavior digest
                </button>
              )}
            </div>
          </div>
        )}

        {hubTab === 'classes' && (
          <>
        <div className="wa-toolbar-top wa-toolbar-top--staff">
          <button type="button" className="wa-pill-btn wa-pill-btn--primary" onClick={() => setShowCreate(true)}>
            + New class
          </button>
          <button
            type="button"
            className="wa-pill-btn wa-pill-btn--outline"
            onClick={() => setShowAddStudents(true)}
            disabled={user?.role === 'teacher' && !hasSchool}
          >
            👤 Add students
          </button>
        </div>

        <div className="wa-invite-banner">
          <strong>👪 Parent invitations</strong>
          <p>Create a signup link for each student&apos;s parent.</p>
          <button type="button" onClick={() => setShowParentInvites(true)}>
            Open parent invites
          </button>
        </div>

        {announcements.filter(a => !dismissed.includes(a.id)).map(a => (
          <div key={a.id} className="wa-announce-chip">
            <div>
              <strong>📢 {a.title}</strong>
              <p>{a.message}</p>
              <span className="wa-announce-meta">{a.admin_name} · {new Date(a.created_at).toLocaleDateString()}</span>
            </div>
            <button type="button" onClick={() => dismissAnnouncement(a.id)} aria-label="Dismiss">✕</button>
          </div>
        ))}

        {classes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <h3>Nta madarasa</h3>
            <p>Fungura ishuri ryawe rya mbere utangire</p>
            <button type="button" className="wa-pill-btn wa-pill-btn--primary" onClick={() => setShowCreate(true)}>+ New class</button>
          </div>
        ) : (
          <>
            <div className="wa-section-title">Your classes</div>
            <div className="wa-class-list wa-class-list--staff">
              {classes.map(cls => (
                <Link key={cls.id} to={`${basePath}/classes/${cls.id}`} className="wa-class-row">
                  <div className="wa-class-avatar">{(cls.name || 'C').slice(0, 1)}</div>
                  <div className="wa-class-body">
                    <strong>{cls.name}</strong>
                    <span>{cls.subject || 'Class'} · Code {cls.class_code} · 👥 {cls.student_count}</span>
                  </div>
                  <span className="wa-class-arrow">›</span>
                </Link>
              ))}
            </div>
            <div className="wa-staff-class-actions">
              {classes[0] && (
                <>
                  <button
                    type="button"
                    className="wa-pill-btn"
                    onClick={() => setAiModal({ classId: classes[0].id, className: classes[0].name })}
                  >
                    🎓 Umunsi AI
                  </button>
                  <Link to={`${basePath}/classes/${classes[0].id}/record-marks`} className="wa-pill-btn wa-pill-btn--outline">
                    📊 CAT Marks
                  </Link>
                </>
              )}
            </div>
          </>
        )}
          </>
        )}
      </main>

      <MobileBottomBar
        items={[
          { id: 'classes', icon: '📚', label: 'Classes', onClick: () => setHubTab('classes'), active: hubTab === 'classes' },
          ...(hasSchool ? [{ id: 'chats', icon: '💬', label: 'Chats', onClick: () => setHubTab('chats'), active: hubTab === 'chats' }] : []),
          { id: 'tools', icon: '⚡', label: 'Tools', onClick: () => setHubTab('tools'), active: hubTab === 'tools' },
          { id: 'parent', icon: '👪', label: 'Parents', onClick: () => setShowParentInvites(true) },
          { id: 'messages', icon: '✉️', label: 'Messages', to: '/messages' },
        ]}
      />

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
    </div>
  );
}
