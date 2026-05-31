import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import JoinClassModal from '../components/JoinClassModal';
import VerifiedBadge from '../components/VerifiedBadge';
import DonateButton from '../components/DonateButton';
import ParentInviteModal from '../components/ParentInviteModal';
import MobileStudentHeader from '../components/MobileStudentHeader';
import MobileBottomBar from '../components/MobileBottomBar';
import CompositionStatusPanel from '../components/CompositionStatusPanel';
import StudentClassmatesList from '../components/StudentClassmatesList';
import './Dashboard.css';
import './MobileDashboard.css';

export default function StudentDashboard() {
  const { user, token, logout, isImpersonating, stopImpersonation } = useAuth();
  const [classes, setClasses] = useState([]);
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => JSON.parse(localStorage.getItem('dismissed_announcements') || '[]'));
  const [showParentInvite, setShowParentInvite] = useState(false);
  const [showCompositionStatus, setShowCompositionStatus] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const classesRef = useRef(null);

  const loadClasses = () => {
    api.get('/classes/my', token).then(data => {
      setClasses(data);
      try { localStorage.setItem('cached_classes', JSON.stringify(data)); } catch {}
    }).catch(e => {
      if (!navigator.onLine) {
        try { const c = JSON.parse(localStorage.getItem('cached_classes') || '[]'); setClasses(c); } catch {}
      } else {
        setError(e.message);
      }
    });
  };

  const dismissAnnouncement = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem('dismissed_announcements', JSON.stringify(updated));
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => {
    api.get('/admin/user-announcements', token).then(setAnnouncements).catch(() => {});
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === '1') {
      setShowCompositionStatus(true);
      setStatusPickerOpen(true);
      window.history.replaceState({}, '', '/student/dashboard');
    }
  }, []);

  const scrollTo = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="dashboard student-wa-dashboard wa-theme">
      <header className="dash-header dash-header--student dash-header--wa">
        <div className="dash-header-desktop-brand dash-brand">UClass</div>
        <MobileStudentHeader
          user={user}
          onLogout={logout}
          onParentInvite={() => setShowParentInvite(true)}
          isImpersonating={isImpersonating}
          stopImpersonation={stopImpersonation}
        />
        <div className="dash-header-desktop-actions dash-user dash-user--wa">
          <span className="wa-header-name">{user?.name}<VerifiedBadge size={15} info={{ items: [
            { icon: '👩‍🎓', label: 'Role', value: 'Student' },
            { icon: '📧', label: 'Email', value: user?.email },
          ] }} /></span>
          <Link to="/profile" className="wa-header-link">Profile</Link>
          <Link to="/student/notes" className="wa-header-link">My Notes</Link>
          <DonateButton />
          <button type="button" className="wa-header-link wa-header-link--btn" onClick={logout}>Logout</button>
          <button type="button" className="wa-header-icon-btn" onClick={() => setShowParentInvite(true)} title="Invite parent">👪</button>
        </div>
      </header>

      <div className="mobile-donate-fab">
        <DonateButton compact fab />
      </div>

      <main className="dash-main wa-chat-screen">
        <div className="wa-toolbar-top">
          <button type="button" className="wa-pill-btn wa-pill-btn--primary" onClick={() => setShowJoin(true)}>
            + Join class
          </button>
        </div>

        <div className="wa-invite-banner">
          <strong>👪 Invite your parent</strong>
          <p>Share a link so they can see your class updates and progress.</p>
          <button type="button" onClick={() => setShowParentInvite(true)}>
            Get parent invite link
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {announcements.filter(a => !dismissed.includes(a.id)).map(a => (
          <div key={a.id} className="wa-announce-chip">
            <div>
              <strong>📢 {a.title}</strong>
              <p>{a.message}</p>
            </div>
            <button type="button" onClick={() => dismissAnnouncement(a.id)} aria-label="Dismiss">✕</button>
          </div>
        ))}

        <div ref={classesRef}>
          <div className="wa-section-title">Chats</div>
          <div className="wa-search-bar">
            <span>🔍</span>
            <span>Search classes &amp; classmates</span>
          </div>

          {classes.length === 0 ? (
            <div className="wa-empty-chat">
              <p>No classes yet</p>
              <button type="button" className="wa-pill-btn wa-pill-btn--primary" onClick={() => setShowJoin(true)}>
                Join a class
              </button>
            </div>
          ) : (
            <div className="wa-class-list">
              {classes.map(cls => (
                <Link key={cls.id} to={`/student/classes/${cls.id}`} className="wa-class-row">
                  <div className="wa-class-avatar">{(cls.name || 'C').slice(0, 1)}</div>
                  <div className="wa-class-body">
                    <strong>{cls.name}</strong>
                    <span className="wa-preview">
                      {cls.subject || 'Class'} · {cls.teacher_name || 'Teacher'}
                    </span>
                  </div>
                  <div className="wa-class-meta">
                    <span className="wa-class-time">Now</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <StudentClassmatesList token={token} classes={classes} />
        </div>
      </main>

      <MobileBottomBar
        items={[
          { id: 'classes', icon: '💬', label: 'Chats', onClick: () => scrollTo(classesRef), active: true },
          { id: 'status', icon: '✍️', label: 'C. Status', onClick: () => { setStatusPickerOpen(false); setShowCompositionStatus(true); } },
          { id: 'notes', icon: '📝', label: 'Notes', to: '/student/notes' },
          { id: 'parent', icon: '👪', label: 'Parent', onClick: () => setShowParentInvite(true) },
          { id: 'profile', icon: '👤', label: 'Profile', to: '/profile' },
        ]}
      />

      {showJoin && (
        <JoinClassModal
          token={token}
          onClose={() => setShowJoin(false)}
          onJoined={() => { setShowJoin(false); loadClasses(); }}
        />
      )}

      {showParentInvite && user?.name && (
        <ParentInviteModal
          token={token}
          selfStudentId={user.id}
          studentName={user.name}
          onClose={() => setShowParentInvite(false)}
        />
      )}

      {showCompositionStatus && (
        <CompositionStatusPanel
          token={token}
          openPickerInitially={statusPickerOpen}
          onClose={() => setShowCompositionStatus(false)}
        />
      )}
    </div>
  );
}
