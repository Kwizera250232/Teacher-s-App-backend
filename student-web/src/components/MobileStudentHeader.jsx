import { Link } from 'react-router-dom';
import VerifiedBadge from './VerifiedBadge';

export default function MobileStudentHeader({
  user,
  onLogout,
  onParentInvite,
  onOpenStatus,
  isImpersonating,
  stopImpersonation,
}) {
  return (
    <div className="mobile-student-header">
      <div className="mobile-student-row1">
        <div className="mobile-student-name">
          <span className="mobile-student-greet">{user?.name}</span>
          <VerifiedBadge
            size={14}
            info={{
              items: [
                { icon: '👩‍🎓', label: 'Role', value: 'Student' },
                { icon: '📧', label: 'Email', value: user?.email },
              ],
            }}
          />
        </div>
        <Link to="/profile" className="mobile-nav-text-btn mobile-profile-btn">
          Profile
        </Link>
      </div>
      <div className="mobile-student-row2">
        {onOpenStatus && (
          <button type="button" className="mobile-nav-text-btn mobile-nav-text-btn--muted" onClick={onOpenStatus}>
            ✍️ C. Status
          </button>
        )}
        <Link to="/student/notes" className="mobile-nav-text-btn mobile-nav-text-btn--muted">
          My Notes
        </Link>
        <button type="button" className="mobile-nav-text-btn mobile-nav-text-btn--muted" onClick={onLogout}>
          Logout
        </button>
        <button
          type="button"
          className="mobile-student-icon-btn"
          onClick={onParentInvite}
          title="Invite parent"
          aria-label="Invite parent"
        >
          <span className="mobile-student-icon-inner" aria-hidden>👪</span>
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
