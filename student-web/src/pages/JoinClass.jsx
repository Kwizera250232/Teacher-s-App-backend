import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { signupEmailDomain, buildSchoolEmailPreview } from '../utils/schoolDomain';
import { STUDENT_SCHOOL_EMAIL_HELP } from '../utils/schoolEmailHelp';
import './Auth.css';
import './JoinClass.css';

export default function JoinClass() {
  const [searchParams] = useSearchParams();
  const code = (searchParams.get('code') || '').toUpperCase();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [classInfo, setClassInfo] = useState(null);
  const [codeError, setCodeError] = useState('');
  const [mode, setMode] = useState('new');
  const [form, setForm] = useState({ name: '', schoolEmailLocal: '', loginEmail: '', password: '' });
  const [emailPreview, setEmailPreview] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const schoolDomain = classInfo
    ? signupEmailDomain({
        name: classInfo.school_name,
        email_domain: classInfo.email_domain,
      })
    : '';

  useEffect(() => {
    if (!code) {
      setCodeError('No class code provided.');
      return;
    }
    api.get(`/classes/preview/${code}`)
      .then(setClassInfo)
      .catch((err) => setCodeError(err.message));
  }, [code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let token;
      let user;
      const loginEmail =
        mode === 'new'
          ? emailPreview ||
            buildSchoolEmailPreview(form.schoolEmailLocal, schoolDomain)
          : form.loginEmail.trim().toLowerCase();

      if (!loginEmail) {
        setError('Create your school email username.');
        setLoading(false);
        return;
      }

      if (mode === 'new') {
        if (!classInfo?.school_id) {
          setError('This class is not linked to a school yet. Ask your teacher.');
          setLoading(false);
          return;
        }
        const data = await api.post('/auth/register', {
          name: form.name,
          password: form.password,
          role: 'student',
          school_id: classInfo.school_id,
          school_email_local: form.schoolEmailLocal.trim(),
        });
        token = data.token;
        user = data.user;
      } else {
        const data = await api.post('/auth/login', {
          email: loginEmail,
          password: form.password,
        });
        token = data.token;
        user = data.user;
        if (user.role !== 'student') {
          setError('Only student accounts can join a class this way.');
          setLoading(false);
          return;
        }
      }

      login(token, user);
      const joined = await api.post('/classes/join', { class_code: code }, token);
      navigate(`/student/classes/${joined.class.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (codeError) {
    return (
      <div className="auth-container">
        <div className="auth-card join-error-card">
          <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
          <h2>Invalid Code</h2>
          <p style={{ color: '#ef4444', marginBottom: 24 }}>{codeError}</p>
          <button className="btn btn-primary btn-full" onClick={() => navigate('/welcome')}>
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!classInfo) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ color: '#888', marginTop: 16 }}>Loading class info…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card join-card">
        <div className="join-class-banner">
          <div className="join-class-icon">🎓</div>
          <div>
            <h2 className="join-class-name">{classInfo.name}</h2>
            {classInfo.subject && <p className="join-class-subject">{classInfo.subject}</p>}
            <p className="join-class-teacher">Teacher: {classInfo.teacher_name}</p>
            {classInfo.school_name && (
              <p className="join-class-teacher">School: {classInfo.school_name}</p>
            )}
          </div>
        </div>

        <div className="join-code-badge">
          Code: <strong>{code}</strong>
        </div>

        <div className="join-toggle">
          <button
            type="button"
            className={`join-toggle-btn ${mode === 'new' ? 'active' : ''}`}
            onClick={() => {
              setMode('new');
              setError('');
            }}
          >
            I&apos;m new here
          </button>
          <button
            type="button"
            className={`join-toggle-btn ${mode === 'existing' ? 'active' : ''}`}
            onClick={() => {
              setMode('existing');
              setError('');
            }}
          >
            I have an account
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'new' && (
            <div className="form-group">
              <label>Your Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Enter your full name"
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>{mode === 'new' ? 'School email (login)' : 'School email'}</label>
            {mode === 'new' ? (
              <div className="auth-school-email-row">
                <input
                  type="text"
                  value={form.schoolEmailLocal}
                  onChange={(e) => {
                    setForm({ ...form, schoolEmailLocal: e.target.value });
                    const dom = schoolDomain;
                    if (e.target.value.trim() && dom) {
                      setEmailPreview(buildSchoolEmailPreview(e.target.value, dom));
                    }
                  }}
                  onBlur={async () => {
                    const local = form.schoolEmailLocal.trim();
                    if (!local || !classInfo.school_id) return;
                    try {
                      const r = await api.get(
                        `/auth/check-school-email?local=${encodeURIComponent(local)}&school_id=${classInfo.school_id}`
                      );
                      setEmailPreview(r.email);
                    } catch {
                      /* optional */
                    }
                  }}
                  placeholder="john.doe"
                  required
                  className="auth-school-email-local"
                />
                <span className="auth-school-email-domain">@{schoolDomain || 'schoolname.edu'}</span>
              </div>
            ) : (
              <input
                type="text"
                value={form.loginEmail}
                onChange={(e) => setForm({ ...form, loginEmail: e.target.value })}
                placeholder="name@schoolname.edu"
                required
              />
            )}
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
              {STUDENT_SCHOOL_EMAIL_HELP}
            </p>
            {emailPreview && mode === 'new' && (
              <p style={{ fontSize: 12, marginTop: 4, color: '#0f766e' }}>
                Login: <strong>{emailPreview}</strong>
              </p>
            )}
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={mode === 'new' ? 'Create a password (min 8 chars)' : 'Your password'}
              minLength={mode === 'new' ? 8 : 1}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full join-submit-btn" disabled={loading}>
            {loading ? 'Joining…' : `Join ${classInfo.name} →`}
          </button>
        </form>

        <p className="join-back">
          <button className="landing-link" type="button" onClick={() => navigate('/welcome')}>
            ← Back to home
          </button>
        </p>
      </div>
    </div>
  );
}
