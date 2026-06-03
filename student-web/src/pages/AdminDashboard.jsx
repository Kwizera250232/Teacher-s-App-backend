import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import AdminSchools from '../components/admin/AdminSchools';
import AdminTeachers from '../components/admin/AdminTeachers';
import AdminStudents from '../components/admin/AdminStudents';
import AdminGuests from '../components/admin/AdminGuests';
import AdminClasses from '../components/admin/AdminClasses';
import AdminContent from '../components/admin/AdminContent';
import AdminAnnouncements from '../components/admin/AdminAnnouncements';
import AdminReports from '../components/admin/AdminReports';
import AdminSettings from '../components/admin/AdminSettings';
import AdminTextbooks from '../components/admin/AdminTextbooks';
import AdminStudentArticles from '../components/admin/AdminStudentArticles';
import SchoolRequestsPanel from '../components/SchoolRequestsPanel';
import VerifiedBadge from '../components/VerifiedBadge';
import { useInstallPrompt } from '../components/InstallPrompt';
import { dashboardPath } from '../utils/roles';
import './AdminDashboard.css';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'schools', label: 'Schools', icon: '🏫' },
  { key: 'teachers', label: 'Teachers', icon: '👨‍🏫' },
  { key: 'students', label: 'Students', icon: '👩‍🎓' },
  { key: 'guests', label: 'Guests', icon: '👤' },
  { key: 'classes', label: 'Classes', icon: '📚' },
  { key: 'content', label: 'Content', icon: '📝' },
  { key: 'announcements', label: 'Announcements', icon: '📢' },
  { key: 'articles', label: 'Articles', icon: '🧾' },
  { key: 'reports', label: 'Reports', icon: '💬' },
  { key: 'textbooks', label: 'AI Textbooks', icon: '🤖' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminDashboard() {
  const { user, token, logout, startImpersonation } = useAuth();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const navigate = useNavigate();
  const [page, setPage] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showViewAs, setShowViewAs] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [impError, setImpError] = useState('');
  const [impLoading, setImpLoading] = useState(false);
  const [pendingArticles, setPendingArticles] = useState(0);

  useEffect(() => {
    if (page === 'dashboard') {
      api.get('/admin/stats', token).then(setStats).catch(() => {});
      api.get('/admin/activity', token).then(setActivity).catch(() => {});
    }
  }, [page, token]);

  useEffect(() => {
    api.get('/admin/student-shares/pending-count', token)
      .then(r => setPendingArticles(Number(r?.count || 0)))
      .catch(() => setPendingArticles(0));
  }, [token, page]);

  const openViewAs = async () => {
    setShowViewAs(true);
    setImpError('');
    if (teachers.length > 0 || students.length > 0) return;
    try {
      const [teacherData, studentData] = await Promise.all([
        api.get('/admin/teachers', token),
        api.get('/admin/students', token),
      ]);
      setTeachers(Array.isArray(teacherData) ? teacherData : []);
      setStudents(Array.isArray(studentData) ? studentData : []);
    } catch (e) {
      setImpError(e.message || 'Failed to load users.');
    }
  };

  const viewAs = async (userId) => {
    if (!userId) return;
    setImpLoading(true);
    setImpError('');
    try {
      const res = await api.post('/admin/impersonate', { user_id: Number(userId) }, token);
      startImpersonation(res.token, res.user);
      setShowViewAs(false);
      navigate(dashboardPath(res.user.role));
    } catch (e) {
      setImpError(e.message || 'Failed to switch account view.');
    } finally {
      setImpLoading(false);
    }
  };

  const maxCount = activity.length ? Math.max(...activity.map(d => parseInt(d.count, 10))) : 1;

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="admin-sidebar-brand">
          <span className="admin-logo">🎓</span>
          {sidebarOpen && <span className="admin-brand-text">UClass Admin</span>}
        </div>
        <nav className="admin-nav">
          {NAV.map(item => (
            <button
              key={item.key}
              className={`admin-nav-item ${page === item.key ? 'active' : ''}`}
              onClick={() => setPage(item.key)}
            >
              <span className="admin-nav-icon">{item.icon}</span>
              {sidebarOpen && (
                <span className="admin-nav-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {item.label}
                  {item.key === 'articles' && pendingArticles > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                      {pendingArticles}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button className="admin-nav-item" onClick={logout}>
            <span className="admin-nav-icon">🚪</span>
            {sidebarOpen && <span className="admin-nav-label">Logout</span>}
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-toggle" onClick={() => setSidebarOpen(o => !o)}>☰</button>
          <h1 className="admin-page-title">{NAV.find(n => n.key === page)?.label}</h1>
          <div className="admin-user-info">
            <button className="btn btn-secondary btn-sm" onClick={openViewAs}>👁 View As</button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>👤 {user?.name}<VerifiedBadge size={14} info={{ items: [
              { icon: '🔐', label: 'Role', value: 'Admin' },
              { icon: '📧', label: 'Email', value: user?.email },
            ] }} /></span>
            <span className="admin-badge">Admin</span>
          </div>
        </header>

        <div className="admin-content">
          {page === 'dashboard' && (
            <div className="admin-dashboard">
              <SchoolRequestsPanel token={token} />
              <div className="stats-grid">
                {[
                  { label: 'Schools', value: stats?.schools, icon: '🏫', color: '#6366f1' },
                  { label: 'Teachers', value: stats?.teachers, icon: '👨‍🏫', color: '#0ea5e9' },
                  { label: 'Students', value: stats?.students, icon: '👩‍🎓', color: '#10b981' },
                  { label: 'Guests', value: stats?.guests, icon: '👤', color: '#0d9488' },
                  { label: 'Classes', value: stats?.classes, icon: '📚', color: '#f59e0b' },
                  { label: 'Quizzes', value: stats?.quizzes, icon: '📝', color: '#ef4444' },
                  { label: 'Homework', value: stats?.homework, icon: '📋', color: '#8b5cf6' },
                  { label: 'Pending Articles', value: stats?.pending_articles ?? pendingArticles, icon: '🧾', color: '#ec4899' },
                  { label: 'App Installs', value: stats?.installations, icon: '📲', color: '#14b8a6' },
                ].map(s => (
                  <div key={s.label} className="stat-card" style={{ '--accent': s.color }}>
                    <div className="stat-icon">{s.icon}</div>
                    <div className="stat-info">
                      <div className="stat-value">{s.value ?? '—'}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="admin-card" style={{ marginBottom: 24 }}>
                <h3 className="admin-card-title">📲 Install UClass App</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 12 }}>
                  PWA installs recorded: <strong>{stats?.installations ?? 0}</strong>
                </p>
                {canInstall ? (
                  <button type="button" className="btn btn-primary" onClick={triggerInstall}>
                    Install app on this device
                  </button>
                ) : (
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                    Open this site in Chrome on mobile/desktop and use the browser menu → Install app, or wait for the install prompt.
                  </p>
                )}
              </div>

              <div className="admin-card">
                <h3 className="admin-card-title">📈 New Registrations (Last 14 Days)</h3>
                {activity.length === 0 ? (
                  <p className="empty-text">No activity data yet.</p>
                ) : (
                  <div className="activity-chart">
                    {activity.map(d => (
                      <div key={d.day} className="chart-bar-wrap">
                        <div
                          className="chart-bar"
                          style={{ height: `${(parseInt(d.count, 10) / maxCount) * 100}%` }}
                          title={`${d.count} registrations`}
                        />
                        <div className="chart-label">
                          {new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {page === 'schools' && <AdminSchools token={token} />}
          {page === 'teachers' && <AdminTeachers token={token} />}
          {page === 'students' && <AdminStudents token={token} />}
          {page === 'guests' && <AdminGuests token={token} />}
          {page === 'classes' && <AdminClasses token={token} />}
          {page === 'content' && <AdminContent token={token} />}
          {page === 'announcements' && <AdminAnnouncements token={token} />}
          {page === 'articles' && <AdminStudentArticles token={token} />}
          {page === 'reports' && <AdminReports token={token} />}
          {page === 'textbooks' && <AdminTextbooks token={token} />}
          {page === 'settings' && <AdminSettings token={token} />}
        </div>
      </div>

      {showViewAs && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowViewAs(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3 style={{ marginBottom: 12 }}>👁 View Account As</h3>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
              Open the teacher or student dashboard as that user (read-only session, 2 hours).
            </p>
            {impError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{impError}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Teacher account</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select className="admin-input" style={{ flex: 1 }} value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)}>
                    <option value="">Select teacher...</option>
                    {teachers.filter(t => t.is_approved && !t.is_suspended).map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" disabled={!selectedTeacher || impLoading} onClick={() => viewAs(selectedTeacher)}>
                    {impLoading ? 'Opening...' : 'Open'}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Student account</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select className="admin-input" style={{ flex: 1 }} value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>
                    <option value="">Select student...</option>
                    {students.filter(s => !s.is_suspended).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" disabled={!selectedStudent || impLoading} onClick={() => viewAs(selectedStudent)}>
                    {impLoading ? 'Opening...' : 'Open'}
                  </button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowViewAs(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
