import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ForgotPassword from './ForgotPassword';

/** Legacy route: deep-link with ?email=&code= opens OTP reset; otherwise redirect to forgot flow. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get('email');
  const code = params.get('code');

  useEffect(() => {
    if (!email && !code) {
      navigate('/forgot-password', { replace: true });
    }
  }, [email, code, navigate]);

  if (email || code) {
    return <ForgotPassword initialEmail={email || ''} initialCode={code || ''} startStep={2} />;
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <p>Redirecting…</p>
        <Link to="/forgot-password">Forgot password</Link>
      </div>
    </div>
  );
}
