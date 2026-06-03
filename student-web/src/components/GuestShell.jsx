import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DonateButton from './DonateButton';
import '../pages/GuestDashboard.css';

const NAV = [
  { id: 'home', label: 'Home', icon: '🏠', path: '/guest/dashboard' },
  { id: 'profile', label: 'Profile', icon: '👤', path: '/guest/profile' },
];

export default function GuestShell({ title, children, backTo }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (item) => location.pathname === item.path;

  return (
    <div className="guest-shell">
      <header className="dashboard-header" style={{ background: '#128c7e' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {backTo ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', marginBottom: 6 }}
              onClick={() => navigate(backTo)}
            >
              ← Back
            </button>
          ) : null}
          <h1 style={{ margin: 0, fontSize: 18, color: '#fff' }}>{title || 'UClass Guest'}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
            {user?.name} · {user?.email}
          </p>
        </div>
        <div className="guest-header-actions">
          <div className="guest-header-donate-desktop">
            <DonateButton />
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <div className="guest-donate-fab">
        <DonateButton compact fab />
      </div>

      <main className="guest-shell__main">{children}</main>

      <nav className="guest-nav" aria-label="Guest navigation">
        {NAV.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={`guest-nav__btn${isActive(item) ? ' guest-nav__btn--active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
