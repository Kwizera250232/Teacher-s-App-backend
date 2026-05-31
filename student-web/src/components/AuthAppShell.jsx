import { Link } from 'react-router-dom';
import './AuthAppShell.css';

/**
 * Signup / login shell — matches in-app WhatsApp-style student header (#128c7e).
 */
export default function AuthAppShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-app-shell wa-theme">
      <header className="auth-app-shell__header">
        <div className="auth-app-shell__brand">
          <span className="auth-app-shell__logo" aria-hidden>🎓</span>
          <div>
            <strong>UClass</strong>
            <span>by Umunsi</span>
          </div>
        </div>
        <p className="auth-app-shell__dean">Dean · Our AI Support</p>
      </header>
      <main className="auth-app-shell__main">
        <div className="auth-app-shell__card">
          {title && <h1>{title}</h1>}
          {subtitle && <p className="auth-app-shell__sub">{subtitle}</p>}
          {children}
        </div>
      </main>
      <footer className="auth-app-shell__footer">
        {footer || (
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        )}
      </footer>
    </div>
  );
}
