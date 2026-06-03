import { Link } from 'react-router-dom';
import './AuthBackLink.css';

/** Return to marketing homepage from signup / login flows. */
export default function AuthBackLink({ to = '/welcome' }) {
  return (
    <Link to={to} className="auth-back-link">
      <span aria-hidden="true">←</span>
      <span>
        Subira ahabanza <span className="auth-back-link__en">· Back to homepage</span>
      </span>
    </Link>
  );
}
