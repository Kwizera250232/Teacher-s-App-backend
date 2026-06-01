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
import CompositionStatusFeed from '../components/CompositionStatusFeed';
import './Dashboard.css';
import './MobileDashboard.css';

const QUICK_NAV = (handlers) => [
  { id: 'classes', icon: '📚', label: 'Classes', onClick: handlers.scrollClasses, active: true },
  { id: 'status', icon: '✍️', label: 'C. Status', onClick: handlers.openStatus },
  { id: 'notes', icon: '📝', label: 'Notes', to: '/student/notes' },
  { id: 'parent', icon: '👪', label: 'Parent', onClick: handlers.openParent },
  { id: 'profile', icon: '👤', label: 'Profile', to: '/profile' },
];

export default function StudentDashboard() {
  const { user, token, logout, isImpersonating, stopImpersonation } = useAuth();
  const [classes, setClasses] = useState([]);
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => JSON.parse(localStorage.getItem('dismissed_announcements') || '[]'));
  const [quickNote, setQuickNote] = useState(null);
  const [showParentInvite, setShowParentInvite] = useState(false);
  const [showCompositionStatus, setShowCompositionStatus] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const classesRef = useRef(null);

  const openStatus = () => {
    setStatusPickerOpen(false);
    setShowCompositionStatus(true);
  };

  const navHandlers = {
    scrollClasses: () => classesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    openStatus,
    openParent: () => setShowParentInvite(true),
  };

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

  const saveQuickNote = async () => {
    if (!quickNote?.text?.trim()) return;
    setQuickNote(q => ({ ...q, saving: true }));
    try {
      await api.post('/student/notes', {
        title: quickNote.text.trim().slice(0, 60) || 'Note',
        content: quickNote.text.trim(),
        color: '#fff9c4',
      }, token);
      setQuickNote(null);
    } catch {
      setQuickNote(q => ({ ...q, saving: false }));
    }
  };

  const quickNavItems = QUICK_NAV(navHandlers);

  return (
    <div className="dashboard student-dashboard-classic">
      <header className="dash-header dash-header--student">
        <div className="dash-header-desktop-brand dash-brand">🎓 UClass</div>
        <MobileStudentHeader
          user={user}
          onLogout={logout}
          onParentInvite={() => setShowParentInvite(true)}
          onOpenStatus={openStatus}
          isImpersonating={isImpersonating}
          stopImpersonation={stopImpersonation}
        />
        <div className="dash-header-desktop-actions dash-user">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            👋 {user?.name}
            <VerifiedBadge size={15} info={{ items: [
              { icon: '👩‍🎓', label: 'Role', value: 'Student' },
              { icon: '📧', label: 'Email', value: user?.email },
            ] }} />
          </span>
          {isImpersonating && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={stopImpersonation}>↩ Return Admin</button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={openStatus}>✍️ C. Status</button>
          <Link to="/profile" className="btn btn-secondary btn-sm">👤 Profile</Link>
          <Link to="/student/notes" className="btn btn-secondary btn-sm">📝 My Notes</Link>
          <DonateButton />
          <button type="button" className="btn btn-sm btn-logout" onClick={logout}>Logout</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowParentInvite(true)}>
            👪 Invite parent
          </button>
        </div>
      </header>

      <div className="mobile-donate-fab">
        <DonateButton compact fab />
      </div>

      <main className="dash-main">
        <div className="dash-top dash-top-actions-desktop">
          <div>
            <h1>My classes</h1>
            <p className="dash-sub">Open a class for homework, quizzes, and class chat</p>
          </div>
          <div className="student-dash-actions">
            <button type="button" className="btn btn-primary" onClick={() => setShowJoin(true)}>+ Join class</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowParentInvite(true)}>👪 Invite parent</button>
            <button type="button" className="btn btn-secondary" onClick={openStatus}>✍️ C. Status</button>
            <Link to="/student/notes" className="btn btn-secondary">📝 My Notes</Link>
          </div>
        </div>

        <nav className="student-desktop-quick-nav" aria-label="Quick actions">
          {quickNavItems.map((item) =>
            item.to ? (
              <Link key={item.id} to={item.to} className="student-desktop-quick-nav__btn">
                <span aria-hidden>{item.icon}</span> {item.label}
              </Link>
            ) : (
              <button key={item.id} type="button" className="student-desktop-quick-nav__btn" onClick={item.onClick}>
                <span aria-hidden>{item.icon}</span> {item.label}
              </button>
            )
          )}
        </nav>

        <div className="wa-invite-banner student-parent-invite-banner">
          <strong>👪 Invite your parent</strong>
          <p>Share a link so they can see your quizzes, marks, and class work.</p>
          <button type="button" onClick={() => setShowParentInvite(true)}>Get parent invite link</button>
        </div>

        <CompositionStatusFeed token={token} />

        {error && <div className="alert alert-error">{error}</div>}

        {announcements.filter(a => !dismissed.includes(a.id)).map(a => (
          <div key={a.id} className="student-announcement">
            <div>
              <strong>📢 {a.title}</strong>
              <p>{a.message}</p>
            </div>
            <button type="button" onClick={() => dismissAnnouncement(a.id)} aria-label="Dismiss">✕</button>
          </div>
        ))}

        <section ref={classesRef} className="student-classes-section" aria-labelledby="student-classes-heading">
          <h2 id="student-classes-heading" className="student-classes-heading">My classes</h2>
          {classes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎒</div>
              <h3>No classes yet</h3>
              <p>Join a class with the code from your teacher</p>
              <button type="button" className="btn btn-primary" onClick={() => setShowJoin(true)}>Join class</button>
            </div>
          ) : (
            <div className="classes-grid classes-grid--square">
              {classes.map(cls => (
                <div key={cls.id} className="class-card-wrap class-card-wrap--square">
                  <Link to={`/student/classes/${cls.id}`} className="class-card class-card--square">
                    <div className="class-card-icon">{(cls.name || 'C').slice(0, 1)}</div>
                    <div className="class-card-header">
                      <h3>{cls.name}</h3>
                      {cls.subject && <span className="subject-tag">{cls.subject}</span>}
                    </div>
                    {cls.class_code && (
                      <div className="class-code-display">
                        <span className="code-label">Code</span>
                        <span className="code-value">{cls.class_code}</span>
                      </div>
                    )}
                    <p className="class-teacher">👨‍🏫 {cls.teacher_name || 'Teacher'}</p>
                    <div className="class-card-footer">
                      <span>Open</span>
                      <span className="arrow">→</span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="class-card-note-btn"
                    onClick={() => setQuickNote({ classId: cls.id, open: true, text: '', saving: false })}
                  >
                    📝 Quick summary note
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>

      <MobileBottomBar items={quickNavItems} className="student-bottom-nav" />

      {showJoin && (
        <JoinClassModal token={token} onClose={() => setShowJoin(false)} onJoined={() => { setShowJoin(false); loadClasses(); }} />
      )}
      {showParentInvite && user?.name && (
        <ParentInviteModal token={token} selfStudentId={user.id} studentName={user.name} onClose={() => setShowParentInvite(false)} />
      )}
      {showCompositionStatus && (
        <CompositionStatusPanel token={token} openPickerInitially={statusPickerOpen} onClose={() => setShowCompositionStatus(false)} />
      )}
      {quickNote?.open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setQuickNote(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3 style={{ marginBottom: 4, fontSize: 18 }}>📝 Quick note</h3>
            <textarea
              autoFocus
              rows={5}
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e0e0e0', borderRadius: 10, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="What did you learn today?"
              value={quickNote.text}
              onChange={e => setQuickNote(q => ({ ...q, text: e.target.value }))}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setQuickNote(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={quickNote.saving || !quickNote.text.trim()} onClick={saveQuickNote}>
                {quickNote.saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
