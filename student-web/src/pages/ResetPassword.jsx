import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/** Legacy route — password reset is a single form at /forgot-password (no code). */
export default function ResetPassword() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/forgot-password', { replace: true });
  }, [navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <p>Redirecting…</p>
        <Link to="/forgot-password">Forgot password</Link>
      </div>
    </div>
  );
}
