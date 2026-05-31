import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import AuthAppShell from '../components/AuthAppShell';
import './Auth.css';

export default function ForgotPassword({ initialEmail = '', initialCode = '', startStep = 1 }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState(startStep);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState('');

  async function handleRequestCode(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const r = await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      if (r.dev_code) setDevCode(String(r.dev_code));
      setStep(2);
      setSuccess(r.message || 'Enter the 6-digit code to continue.');
    } catch (err) {
      setError(err.message || 'Hari ikibazo. Ongera ugerageze.');
    }
    setLoading(false);
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirm) {
      return setError('Ijambobanga rishya ntirihuye. Ongera ugerageze.');
    }
    if (newPassword.length < 8) {
      return setError('Ijambobanga rigomba kuba nibura inyuguti 8 kandi ririmo imibare.');
    }
    if (!/^\d{6}$/.test(code.trim())) {
      return setError('Kode igomba kuba imibare 6.');
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        token: code.trim(),
        newPassword,
      });
      setSuccess('Ijambobanga ryahinduwe neza. Injira ukoresheje rishya.');
      setStep(3);
    } catch (err) {
      setError(err.message || 'Hari ikibazo. Ongera ugerageze.');
    }
    setLoading(false);
  }

  return (
    <AuthAppShell
      title="Gusubiza Ijambobanga"
      subtitle="Same WhatsApp-style look as inside the app"
      footer={<p><Link to="/login">← Subira ku Kwinjira</Link></p>}
    >
      {step === 1 && (
        <>
          <p className="auth-app-shell__hint">
            Injiza imeyili yawe. Uzahabwa kode y&apos;imibare 6.
          </p>
          <form onSubmit={handleRequestCode}>
            <div className="form-group">
              <label>Imeyili</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="imeyili@example.com"
                required
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Gutegereza...' : 'Ohereza kode'}
            </button>
          </form>
        </>
      )}

      {step === 2 && (
        <form onSubmit={handleReset}>
          <p className="auth-app-shell__hint">{success}</p>
          {devCode && (
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              Dev code: <strong>{devCode}</strong>
            </div>
          )}
          <div className="form-group">
            <label>Imeyili</label>
            <input type="email" value={email} readOnly />
          </div>
          <div className="form-group">
            <label>Kode (imibare 6)</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              required
              inputMode="numeric"
            />
          </div>
          <div className="form-group">
            <label>Ijambobanga Rishya</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nibura inyuguti 8"
              required
            />
          </div>
          <div className="form-group">
            <label>Ongera Ijambobanga</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Gutegereza...' : 'Hindura Ijambobanga'}
          </button>
        </form>
      )}

      {step === 3 && <div className="alert alert-success">{success}</div>}
    </AuthAppShell>
  );
}
