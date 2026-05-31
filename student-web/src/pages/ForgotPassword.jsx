import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import AuthAppShell from '../components/AuthAppShell';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        newPassword,
      });
      setSuccess('Ijambobanga ryahinduwe neza. Injira ukoresheje rishya.');
      setNewPassword('');
      setConfirm('');
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
      <p className="auth-app-shell__hint">
        Injiza imeyili yawe n&apos;ijambobanga rishya. Nta kode isabwa.
      </p>
      {success ? (
        <div className="alert alert-success">{success}</div>
      ) : (
        <form onSubmit={handleReset}>
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
    </AuthAppShell>
  );
}
