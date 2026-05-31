import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import './Auth.css';
import './JoinClass.css';

export default function JoinClass() {
  const [searchParams] = useSearchParams();
  const code = (searchParams.get('code') || '').toUpperCase();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [classInfo, setClassInfo] = useState(null);
  const [codeError, setCodeError] = useState('');
  const [mode, setMode] = useState('new'); // 'new' | 'existing'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code) { setCodeError('No class code provided.'); return; }
    api.get(`/classes/preview/${code}`)
      .then(setClassInfo)
      .catch(err => setCodeError(err.message));
  }, [code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let token, user;

      if (mode === 'new') {
        // Register new student account
        const data = await api.post('/auth/register', {
          name: form.name,
          email: form.email,
          password: form.password,
          role: 'student',
        });
        token = data.token;
        user = data.user;
      } else {
        // Login existing account
        const data = await api.post('/auth/login', {
          email: form.email,
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

      // Join the class
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
        {/* Class banner */}
        <div className="join-class-banner">
          <div className="join-class-icon">🎓</div>
          <div>
            <h2 className="join-class-name">{classInfo.name}</h2>
            {classInfo.subject && <p className="join-class-subject">{classInfo.subject}</p>}
            <p className="join-class-teacher">Teacher: {classInfo.teacher_name}</p>
          </div>
        </div>

        <div className="join-code-badge">Code: <strong>{code}</strong></div>

        {/* Toggle */}
        <div className="join-toggle">
          <button
            type="button"
            className={`join-toggle-btn ${mode === 'new' ? 'active' : ''}`}
            onClick={() => { setMode('new'); setError(''); }}
          >
            I'm new here
          </button>
          <button
            type="button"
            className={`join-toggle-btn ${mode === 'existing' ? 'active' : ''}`}
            onClick={() => { setMode('existing'); setError(''); }}
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
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Enter your full name"
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
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
          <button className="landing-link" onClick={() => navigate('/welcome')}>← Back to home</button>
        </p>
      </div>
    </div>
  );
}
