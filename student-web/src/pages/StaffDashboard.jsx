import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import CreateClassModal from '../components/CreateClassModal';
import AddStudentsModal from '../components/AddStudentsModal';
import SchoolRequestBanner from '../components/SchoolRequestBanner';
import SchoolRequestsPanel from '../components/SchoolRequestsPanel';
import VerifiedBadge from '../components/VerifiedBadge';
import StaffQuickActions from '../components/StaffQuickActions';
import SchoolHubPanel from '../components/staff/SchoolHubPanel';
import AddTeacherModal from '../components/staff/AddTeacherModal';
import NotifyParentsModal from '../components/staff/NotifyParentsModal';
import ParentInvitesPickerModal from '../components/ParentInvitesPickerModal';
import StaffChatsPanel from '../components/staff/StaffChatsPanel';
import WeeklyDigestModal from '../components/staff/WeeklyDigestModal';
import MobileStaffHeader from '../components/MobileStaffHeader';
import DonateButton from '../components/DonateButton';
import './Dashboard.css';
import './ParentHub.css';
import './MobileDashboard.css';
import CompositionStatusList from '../components/CompositionStatusList';
import StaffClassNowPanel from '../components/staff/StaffClassNowPanel';
import '../components/classMoments/ClassMoments.css';

export default function StaffDashboard({ roleLabel, basePath }) {
  const { user, token, logout, isImpersonating, stopImpersonation } = useAuth();
  const [classes, setClasses] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddStudents, setShowAddStudents] = useState(false);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => JSON.parse(localStorage.getItem('dismissed_announcements') || '[]'));
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
    { id: 'classnow', label: '📸 Class Now' },
    { id: 'tools', label: '⚡ Tools' },
  ];

  return (
    <div className="dashboard staff-hub-page staff-dashboard-classic wa-theme">
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
          <Link to="/profile" className="btn btn-secondary btn-sm">👤 Profile</Link>
          <button type="button" className="btn btn-sm btn-logout" onClick={logout}>Logout</button>
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

      <main className={`dash-main${hubTab === 'chats' ? ' dash-main--chats-full' : ''}`}>
        {hubTab !== 'chats' && <SchoolRequestBanner token={token} user={user} />}
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

        {hubTab === 'classnow' && (
          <StaffClassNowPanel token={token} classes={classes} />
        )}

        {hubTab === 'tools' && (
          <div style={{ marginBottom: 16 }}>
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
        <div className="dash-top dash-top--staff-actions">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Fungura Ishuri
            </button>
            <button className="btn btn-secondary" onClick={() => setShowAddStudents(true)} disabled={user?.role === 'teacher' && !hasSchool}>
              👤 Add Students
            </button>
          </div>
        </div>

        {announcements.filter(a => !dismissed.includes(a.id)).map(a => (
          <div key={a.id} style={{
            background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
            border: '1px solid #93c5fd',
            borderRadius: 12,
            padding: '1rem 1.25rem',
            marginBottom: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}>
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
              onClick={() => dismissAnnouncement(a.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem', padding: 0, lineHeight: 1, flexShrink: 0 }}
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
          <>
            <div className="wa-section-title">Your classes</div>
            <div className="classes-grid classes-grid--square">
              {classes.map(cls => (
                <Link key={cls.id} to={`${basePath}/classes/${cls.id}`} className="class-card class-card--square">
                  <div className="class-card-icon">{(cls.name || 'C').slice(0, 1)}</div>
                  <div className="class-card-header">
                    <h3>{cls.name}</h3>
                    {cls.subject && <span className="subject-tag">{cls.subject}</span>}
                  </div>
                  <p className="class-teacher">Code {cls.class_code} · 👥 {cls.student_count}</p>
                  <div className="class-card-footer">
                    <span>Open class</span>
                    <span className="arrow">→</span>
                  </div>
                </Link>
              ))}
            </div>
            {classes[0] && (
              <div className="wa-staff-class-actions">
                <Link to={`${basePath}/classes/${classes[0].id}/record-marks`} className="wa-pill-btn wa-pill-btn--outline">
                  📊 CAT Marks
                </Link>
              </div>
            )}
          </>
        )}
          </>
        )}
      </main>

      <div className="mobile-staff-quick-bar">
        <button type="button" onClick={() => { setHubTab('classes'); setShowAddStudents(true); }}>
          👥 View students
        </button>
        <button type="button" onClick={() => setHubTab('classnow')}>
          📸 Class Now
        </button>
        <button type="button" onClick={() => setHubTab('tools')}>
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
