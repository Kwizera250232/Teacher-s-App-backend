import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import AuthAppShell from '../components/AuthAppShell';
import './Auth.css';

export default function Register() {
  const [searchParams] = useSearchParams();
  const searchRole = searchParams.get('role');
  const classCode = searchParams.get('code') || '';

  // step: 'role' → 'code' (if teacher/HT) → 'form'
  const [step, setStep] = useState('role');
  const [selectedRole, setSelectedRole] = useState(
    ['head_teacher', 'teacher'].includes(searchRole) ? searchRole : 'student'
  );
  const [codeInput, setCodeInput] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [verifiedSchool, setVerifiedSchool] = useState(null);
  const [optionalCode, setOptionalCode] = useState('');
  const [showOptionalCode, setShowOptionalCode] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    schoolEmailLocal: '',
    password: '',
    phone: '',
    school_id: '',
    newSchool: '',
  });
  const [schoolEmailPreview, setSchoolEmailPreview] = useState('');
  const [schoolEmailStatus, setSchoolEmailStatus] = useState('');
  const [studentEmailStatus, setStudentEmailStatus] = useState('');

  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/auth/schools').then(setSchools).catch(() => {});
  }, []);

  useEffect(() => {
    if (['head_teacher', 'teacher'].includes(searchRole)) {
      setStep('form');
    }
  }, [searchRole]);

  const handleRoleNext = () => {
    setStep('form');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let schoolId = form.school_id;
      if (form.newSchool.trim() && selectedRole === 'student') {
        const school = await api.post('/auth/schools', { name: form.newSchool.trim() });
        schoolId = school.id;
      }

      const isStaff = selectedRole === 'teacher' || selectedRole === 'head_teacher';

      if (isStaff) {
        if (!form.schoolEmailLocal.trim()) {
          setError('Create your school email username.');
          setLoading(false);
          return;
        }
      } else if (form.email.trim()) {
        await api.post('/auth/validate-email', {
          email: form.email.trim().toLowerCase(),
          school_code: verifiedSchool ? codeInput.trim().toUpperCase() : undefined,
          school_id: schoolId || undefined,
        });
      }

      const payload = {
        name: form.name,
        password: form.password,
        role: selectedRole,
        school_id: verifiedSchool ? verifiedSchool.id : (schoolId || null),
        phone: form.phone || undefined,
      };

      if (isStaff) {
        payload.school_email_local = form.schoolEmailLocal.trim();
      } else {
        payload.email = form.email.trim().toLowerCase();
      }

      const codeForRegister = (verifiedSchool && (codeInput || optionalCode))
        ? (codeInput || optionalCode).trim().toUpperCase()
        : '';
      if (codeForRegister) {
        payload.school_code = codeForRegister;
      }

      const data = await api.post('/auth/register', payload);

      if (data.pending) {
        if (data.login_email) setSchoolEmailPreview(data.login_email);
        setPending(true);
        return;
      }

      login(data.token, data.user);
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
      title={pending ? "Konti Yoherejwe" : step === "role" ? "Fungura Konti" : "Fungura Konti"}
      subtitle={pending ? "Tegereza kwemezwa n'umuyobozi" : step === "role" ? "Hitamo uwo uri we" : "Injira mu rubuga rw'inyigisho"}
      footer={<p>Usanzwe ufite konti? <Link to="/login">Injira</Link></p>}
    >
        {pending ? (
          <>
            <p className="auth-app-shell__sub" style={{ marginTop: 12, lineHeight: 1.6 }}>
              Konti yawe y'umwarimu yoherejwe.{' '}
              <strong>Tegereza ko umuyobozi w'ishuri ayemera</strong> mbere yo kwinjira.
              {schoolEmailPreview && (
                <>
                  <br />
                  Injira ukoresheje: <strong>{schoolEmailPreview}</strong>
                </>
              )}
            </p>
            <div style={{ marginTop: 24 }}>
              <a href="/login" className="btn btn-primary btn-full">
                Subira ku Kwinjira
              </a>
            </div>
          </>
        ) : step === 'role' ? (
          <>

            <div className="form-group" style={{ marginTop: 20 }}>
              <label>Ndi</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={{ fontSize: '1rem', padding: '0.6rem' }}
              >
                <option value="student">👨‍🎓 Umunyeshuri (Student)</option>
                <option value="head_teacher">🏫 Umuyobozi w'Ishuri (Head Teacher)</option>
                <option value="teacher">👨‍🏫 Umwarimu (Teacher)</option>
              </select>
            </div>

            {selectedRole === 'student' && (
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
                Students select their school from the list in the next step.
              </p>
            )}
            {(selectedRole === 'head_teacher' || selectedRole === 'teacher') && (
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
                Sign up now with your UClass school email. You can link to your school from the dashboard after login (school code optional).
              </p>
            )}

            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: 20 }}
              onClick={handleRoleNext}
            >
              Komeza →
            </button>

          </>
        ) : (
          <>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Amazina Yuzuye</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Amazina yawe yuzuye"
                  required
                />
              </div>
              {(selectedRole === 'teacher' || selectedRole === 'head_teacher') ? (
                <>
                <div className="form-group">
                  <label>Fungura imeyili y&apos;ishuri yawe (login)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={form.schoolEmailLocal}
                      onChange={(e) => {
                        setForm({ ...form, schoolEmailLocal: e.target.value });
                        setSchoolEmailStatus('');
                      }}
                      onBlur={async () => {
                        const local = form.schoolEmailLocal.trim();
                        if (!local) return;
                        const code = (verifiedSchool ? codeInput : optionalCode).trim().toUpperCase();
                        if (!code) {
                          setSchoolEmailStatus('Enter your school code first to get @yourschool.edu');
                          return;
                        }
                        try {
                          const q = `local=${encodeURIComponent(local)}&code=${encodeURIComponent(code)}`;
                          const r = await api.get(`/auth/check-school-email?${q}`);
                          setSchoolEmailPreview(r.email);
                          setSchoolEmailStatus(
                            r.available ? `✓ ${r.email} is available` : `✗ ${r.email} is already taken`
                          );
                          if (r.school_name && code) {
                            setVerifiedSchool((prev) => prev || { name: r.school_name, code, email_domain: r.email_domain });
                          }
                        } catch (err) {
                          setSchoolEmailStatus(err.message);
                        }
                      }}
                      placeholder="john.doe"
                      required
                      style={{ flex: '1 1 140px', minWidth: 120 }}
                    />
                    <span style={{ color: '#475569', fontWeight: 600 }}>
                      @{verifiedSchool?.email_domain || 'yourschool.edu'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    Your login is <strong>username@schoolname.edu</strong> — enter your school code below to set the school name in the address.
                  </p>
                  {schoolEmailStatus && (
                    <p style={{ fontSize: 12, marginTop: 4, color: schoolEmailStatus.startsWith('✓') ? '#059669' : '#dc2626' }}>
                      {schoolEmailStatus}
                    </p>
                  )}
                </div>
                {!showOptionalCode ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ marginBottom: 12 }}
                    onClick={() => setShowOptionalCode(true)}
                  >
                    I have a school code (optional)
                  </button>
                ) : (
                  <div className="form-group">
                    <label>School code (optional)</label>
                    <input
                      type="text"
                      value={optionalCode}
                      onChange={(e) => {
                        setOptionalCode(e.target.value.toUpperCase());
                        setCodeInput(e.target.value.toUpperCase());
                        setVerifiedSchool(null);
                        setCodeError('');
                      }}
                      onBlur={async () => {
                        const c = optionalCode.trim();
                        if (!c) return;
                        setCodeLoading(true);
                        setCodeError('');
                        try {
                          const data = await api.get(`/auth/validate-school-code?code=${encodeURIComponent(c)}`);
                          if (selectedRole === 'head_teacher' && data.school.has_head_teacher) {
                            setCodeError('This school already has a Head Teacher. Continue without code or join as Teacher.');
                            setVerifiedSchool(null);
                          } else {
                            setVerifiedSchool(data.school);
                            setCodeInput(c);
                            setSchoolEmailStatus('');
                          }
                        } catch (err) {
                          setCodeError(err.message);
                          setVerifiedSchool(null);
                        } finally {
                          setCodeLoading(false);
                        }
                      }}
                      placeholder="e.g. AB3X7YQ2"
                      maxLength={12}
                      style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
                    />
                    {codeError && <p style={{ fontSize: 12, color: '#dc2626' }}>{codeError}</p>}
                    {verifiedSchool && (
                      <p style={{ fontSize: 12, color: '#059669' }}>🏫 {verifiedSchool.name}</p>
                    )}
                  </div>
                )}
                </>
              ) : (
                <div className="form-group">
                  <label>Imeyili</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); setStudentEmailStatus(''); }}
                    onBlur={async () => {
                      const em = form.email.trim().toLowerCase();
                      if (!em || selectedRole !== 'student') return;
                      try {
                        await api.post('/auth/validate-email', {
                          email: em,
                          school_id: form.school_id || verifiedSchool?.id || undefined,
                        });
                        setStudentEmailStatus('✓ Email looks valid');
                      } catch (err) {
                        setStudentEmailStatus(err.message);
                      }
                    }}
                    placeholder="you@gmail.com"
                    required
                  />
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    Use a real Gmail address or your school email. Fake or disposable addresses are not allowed.
                  </p>
                  {studentEmailStatus && (
                    <p style={{ fontSize: 12, marginTop: 4, color: studentEmailStatus.startsWith('✓') ? '#059669' : '#dc2626' }}>
                      {studentEmailStatus}
                    </p>
                  )}
                </div>
              )}
              <div className="form-group">
                <label>Ijambo Banga</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Nibura inyuguti 8"
                  minLength={8}
                  required
                />
              </div>
              {selectedRole === 'student' && (
                <>
                  <div className="form-group">
                    <label>Ishuri</label>
                    <select
                      value={form.school_id}
                      onChange={(e) => setForm({ ...form, school_id: e.target.value, newSchool: '' })}
                    >
                      <option value="">Hitamo ishuri...</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cyangwa ongeraho ishuri rishya</label>
                    <input
                      type="text"
                      value={form.newSchool}
                      onChange={(e) => setForm({ ...form, newSchool: e.target.value, school_id: '' })}
                      placeholder="Andika izina ry'ishuri rishya"
                    />
                  </div>
                </>
              )}
              {(selectedRole === 'teacher' || selectedRole === 'head_teacher') && verifiedSchool && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: '#e0e7ff',
                    borderRadius: 8,
                    marginBottom: 16,
                    color: '#3730a3',
                    fontWeight: 600,
                  }}
                >
                  🏫 School: <strong>{verifiedSchool.name}</strong>
                  {selectedRole === 'teacher' && (
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 400, marginTop: 4 }}>
                      Your account may need Head Teacher approval before login.
                    </span>
                  )}
                </div>
              )}
              <div className="form-group">
                <label>Terefone (optional)</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+250 78 123 4567"
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Gutegereza...' : 'Fungura Konti'}
              </button>
            </form>
            <p className="auth-link">
              Usanzwe ufite konti? <Link to="/login">Injira</Link>
            </p>
          </>
        )}
    </AuthAppShell>
  );
}

