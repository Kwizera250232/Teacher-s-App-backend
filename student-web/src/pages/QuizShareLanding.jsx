import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { buildSchoolEmailPreview } from '../utils/schoolDomain';
import './Auth.css';
import './QuizShareLanding.css';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'student.umunsi.com'
    ? 'https://studentapi.umunsi.com/api'
    : `${window.location.origin.replace(/\/$/, '')}/api`);

export default function QuizShareLanding() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login, user, token: authToken } = useAuth();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [guestForm, setGuestForm] = useState({ name: '', username: '', password: '' });
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestErr, setGuestErr] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Invalid quiz link.');
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/public/quizzes/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load quiz.');
        setPreview(body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!user || !token || !preview) return;
    if (user.role === 'guest' && authToken) {
      api.post('/guest/claim-share', { share_token: token }, authToken).catch(() => {});
      navigate(`/guest/classes/${preview.class_id}/quizzes/${preview.quiz_id}`, { replace: true });
    }
  }, [user, authToken, token, preview, navigate]);

  const guestEmailPreview =
    guestForm.username.trim() && buildSchoolEmailPreview(guestForm.username, 'guest.umunsi.com');

  const submitGuest = async (e) => {
    e.preventDefault();
    setGuestErr('');
    setGuestBusy(true);
    try {
      const data = await api.post('/auth/register', {
        name: guestForm.name.trim(),
        password: guestForm.password,
        role: 'guest',
        guest_email_local: guestForm.username.trim(),
        quiz_share_token: token,
      });
      login(data.token, data.user);
      const redir = data.guest_share_redirect;
      if (redir?.class_id && redir?.quiz_id) {
        navigate(`/guest/classes/${redir.class_id}/quizzes/${redir.quiz_id}`, { replace: true });
      } else {
        navigate('/guest/dashboard', { replace: true });
      }
    } catch (err) {
      setGuestErr(err.message);
    } finally {
      setGuestBusy(false);
    }
  };

  const registerLink = (role) =>
    `/register?role=${role}&quiz_share=${encodeURIComponent(token || '')}${
      preview?.school_id ? `&school_id=${preview.school_id}` : ''
    }`;

  return (
    <div className="quiz-share-landing">
      <header className="quiz-share-landing__head">
        <Link to="/welcome" className="quiz-share-landing__brand">
          UClass
        </Link>
      </header>

      {loading && <p className="quiz-share-landing__muted">Loading quiz…</p>}
      {error && !loading && (
        <div className="quiz-share-landing__card quiz-share-landing__card--error">
          <p>{error}</p>
          <Link to="/welcome" className="btn btn-primary">
            Home
          </Link>
        </div>
      )}

      {!loading && !error && preview && (
        <div className="quiz-share-landing__card">
          <p className="quiz-share-landing__eyebrow">Shared quiz</p>
          <h1>{preview.quiz_title}</h1>
          <p className="quiz-share-landing__meta">
            {preview.class_name}
            {preview.teacher_name ? ` · ${preview.teacher_name}` : ''}
          </p>
          {preview.quiz_description && (
            <p className="quiz-share-landing__desc">{preview.quiz_description}</p>
          )}
          <p className="quiz-share-landing__hint">
            Guests can practice without joining the class or appearing on the leaderboard.
            Students and teachers use their normal signup.
          </p>

          <section className="quiz-share-landing__section">
            <h2>👤 Guest — try the quiz only</h2>
            <p className="quiz-share-landing__sub">
              No school class membership. Login: <strong>name@guest.umunsi.com</strong>
            </p>
            {guestErr && <div className="alert alert-error">{guestErr}</div>}
            <form onSubmit={submitGuest} className="quiz-share-landing__form">
              <label>
                Full name
                <input
                  required
                  value={guestForm.name}
                  onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                />
              </label>
              <label>
                Username (guest email)
                <div className="auth-school-email-row">
                  <input
                    required
                    className="auth-school-email-local"
                    value={guestForm.username}
                    onChange={(e) => setGuestForm({ ...guestForm, username: e.target.value })}
                    placeholder="john.doe"
                  />
                  <span className="auth-school-email-domain">@guest.umunsi.com</span>
                </div>
              </label>
              {guestEmailPreview && (
                <p style={{ fontSize: 12, color: '#0f766e', margin: '4px 0 0' }}>
                  Login: <strong>{guestEmailPreview}</strong>
                </p>
              )}
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={guestForm.password}
                  onChange={(e) => setGuestForm({ ...guestForm, password: e.target.value })}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-full" disabled={guestBusy}>
                {guestBusy ? 'Creating…' : 'Continue as Guest →'}
              </button>
            </form>
          </section>

          <section className="quiz-share-landing__section quiz-share-landing__section--roles">
            <h2>Or sign up with your role</h2>
            <div className="quiz-share-landing__role-grid">
              <Link to={registerLink('student')} className="btn btn-secondary">
                👨‍🎓 Umunyeshuri (Student)
              </Link>
              <Link to={registerLink('teacher')} className="btn btn-secondary">
                👨‍🏫 Umwarimu (Teacher)
              </Link>
              <Link to={registerLink('head_teacher')} className="btn btn-secondary">
                🏫 Umuyobozi w&apos;ishuri (HT)
              </Link>
            </div>
            <p className="quiz-share-landing__login">
              Already have an account?{' '}
              <Link to={`/login?quiz_share=${encodeURIComponent(token)}`}>Injira / Sign in</Link>
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
