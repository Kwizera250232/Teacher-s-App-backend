import { Link } from 'react-router-dom';
import VerifiedBadge from './VerifiedBadge';

export default function MobileStaffHeader({
  user,
  roleLabel,
  onLogout,
  isImpersonating,
  stopImpersonation,
}) {
  return (
    <div className="mobile-staff-header">
      <div className="mobile-student-row1">
        <div className="mobile-student-name">
          <span className="mobile-student-greet">{user?.name}</span>
          <VerifiedBadge
            size={14}
            info={{
              items: [
                { icon: '👨‍🏫', label: 'Role', value: roleLabel },
                { icon: '📧', label: 'Email', value: user?.email },
              ],
            }}
          />
        </div>
        <Link to="/profile" className="mobile-nav-text-btn">
          Profile
        </Link>
      </div>
      <div className="mobile-student-row2 mobile-staff-row2">
        <Link to="/messages" className="mobile-nav-text-btn mobile-nav-text-btn--muted">
          Messages
        </Link>
        <button type="button" className="mobile-nav-text-btn mobile-nav-text-btn--muted" onClick={onLogout}>
          Logout
        </button>
        {isImpersonating && (
          <button type="button" className="mobile-nav-text-btn" onClick={stopImpersonation}>
            ↩ Admin
          </button>
        )}
      </div>
    </div>
  );
}
