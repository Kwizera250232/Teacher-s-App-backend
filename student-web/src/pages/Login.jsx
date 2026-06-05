import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import AuthAppShell from '../components/AuthAppShell';
import AuthBackLink from '../components/AuthBackLink';
import './Auth.css';

export default function Login() {
  const [searchParams] = useSearchParams();
  const classCode = searchParams.get('code') || '';
  const quizShare = searchParams.get('quiz_share') || '';
  const parentToken = searchParams.get('parent_token') || '';
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { ...form };
      if (quizShare) payload.quiz_share_token = quizShare;
      if (parentToken) payload.parent_token = parentToken;
      const data = await api.post('/auth/login', payload);
      login(data.token, data.user);
      if (parentToken && data.user.role === 'parent') {
        const linked = data.parent_invite_linked?.linked;
        if (!linked && data.parent_invite_linked?.reason === 'invalid_or_expired') {
          setError('This parent invitation has expired. Ask your child or teacher for a new link.');
          setLoading(false);
          return;
        }
        if (!linked) {
          try {
            await api.post('/parent/accept-invite', { parent_token: parentToken }, data.token);
          } catch (linkErr) {
            if (!String(linkErr.message || '').includes('already')) {
              setError(linkErr.message || 'Could not link your child from this invitation.');
              setLoading(false);
              return;
            }
          }
        }
      }
      const shareRedir = data.quiz_share_redirect;
      if (shareRedir?.class_id && shareRedir?.quiz_id) {
        if (data.user.role === 'guest') {
          navigate(`/guest/classes/${shareRedir.class_id}/quizzes/${shareRedir.quiz_id}`, { replace: true });
          return;
        }
        if (data.user.role === 'student') {
          navigate(`/student/classes/${shareRedir.class_id}/quizzes/${shareRedir.quiz_id}`, { replace: true });
          return;
        }
      }
      if (data.user.role === 'student' && classCode) {
        try {
          const joined = await api.post('/classes/join', { class_code: classCode }, data.token);
          navigate(`/student/classes/${joined.class.id}`);
        } catch {
          navigate('/student/dashboard');
        }
      } else {
        navigate(dashboardPath(data.user.role));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthAppShell
      title="Murakaza Neza"
      subtitle={
        parentToken
          ? 'Sign in to link your child and view their marks and class work'
          : 'Injira muri konti yawe — same look as inside the app'
      }
      footer={
        <p>
          Nta konti ufite?{' '}
          <Link to={parentToken ? `/invite?parent_token=${encodeURIComponent(parentToken)}` : '/register'}>
            Iyandikishe
          </Link>
        </p>
      }
    >
        <AuthBackLink />
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Imeyili y&apos;ishuri</label>
            <input
              type="text"
              autoComplete="username"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value.trim().toLowerCase() })}
              placeholder="amazina@schoolname.edu"
              required
            />
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
              Umwarimu, Umunyeshuri, cyangwa Umuyobozi w&apos;ishuri — injira ukoresheje imeyili yawe @schoolname.edu.
              Guests use <strong>@guest.umunsi.com</strong>.
            </p>
            {quizShare && (
              <p style={{ fontSize: 12, color: '#0f766e', marginTop: 8, lineHeight: 1.4 }}>
                After sign-in you will continue to the shared quiz.
              </p>
            )}
          </div>
          <div className="form-group">
            <label>Ijambo Banga</label>
            <div className="auth-password-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                tabIndex={-1}
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Hisha ijambobanga' : 'Erekana ijambobanga'}
              >
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Gutegereza...' : 'Injira'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 10 }}>
          <Link to="/forgot-password" style={{ color: '#128c7e', fontSize: 13, fontWeight: 600 }}>Wibagiwe ijambobanga?</Link>
        </p>
    </AuthAppShell>
  );
}
