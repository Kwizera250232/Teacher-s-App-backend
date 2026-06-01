import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import { schoolDomainFromName, buildSchoolEmailPreview } from '../utils/schoolDomain';
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
  const [verifiedSchool, setVerifiedSchool] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    schoolEmailLocal: '',
    staffSchoolName: '',
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
        if (!verifiedSchool && !form.staffSchoolName.trim()) {
          setError('Andika izina ry\'ishuri.');
          setLoading(false);
          return;
        }
      } else if (form.email.trim()) {
        await api.post('/auth/validate-email', {
          email: form.email.trim().toLowerCase(),
          school_code: verifiedSchool?.code ? String(verifiedSchool.code).trim().toUpperCase() : undefined,
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
        if (!verifiedSchool && form.staffSchoolName.trim()) {
          payload.staff_school_name = form.staffSchoolName.trim();
        }
      } else {
        payload.email = form.email.trim().toLowerCase();
      }

      if (verifiedSchool?.code) {
        payload.school_code = String(verifiedSchool.code).trim().toUpperCase();
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
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">🎓</div>

        {pending ? (
          <>
            <h2>✅ Konti Yoherejwe!</h2>
            <p className="auth-sub" style={{ marginTop: 12, lineHeight: 1.6 }}>
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
            <h2>Fungura Konti</h2>
            <p className="auth-sub">Hitamo uwo uri we</p>

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
            <p className="auth-link" style={{ marginTop: 16 }}>
              Usanzwe ufite konti? <Link to="/login">Injira</Link>
            </p>
          </>
        ) : (
          <>
            <h2>Fungura Konti</h2>
            <p className="auth-sub">Injira mu rubuga rw'inyigisho</p>
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
                  <label>Izina ry&apos;ishuri</label>
                  <input
                    type="text"
                    value={verifiedSchool ? verifiedSchool.name : form.staffSchoolName}
                    onChange={(e) => {
                      if (verifiedSchool) return;
                      setForm({ ...form, staffSchoolName: e.target.value });
                      setSchoolEmailStatus('');
                      const dom = schoolDomainFromName(e.target.value);
                      if (form.schoolEmailLocal.trim() && dom) {
                        setSchoolEmailPreview(buildSchoolEmailPreview(form.schoolEmailLocal, dom));
                      }
                    }}
                    readOnly={Boolean(verifiedSchool)}
                    placeholder="e.g. Green Hills Academy"
                    required={!verifiedSchool}
                    style={verifiedSchool ? { background: '#f1f5f9' } : undefined}
                  />
                </div>
                <div className="form-group">
                  <label>Imeyili y&apos;ishuri (login)</label>
                  <div className="auth-school-email-row">
                    <input
                      type="text"
                      value={form.schoolEmailLocal}
                      onChange={(e) => {
                        const local = e.target.value;
                        setForm({ ...form, schoolEmailLocal: local });
                        setSchoolEmailStatus('');
                        const dom = verifiedSchool?.email_domain || schoolDomainFromName(form.staffSchoolName);
                        if (local.trim() && dom) {
                          setSchoolEmailPreview(buildSchoolEmailPreview(local, dom));
                        }
                      }}
                      onBlur={async () => {
                        const local = form.schoolEmailLocal.trim();
                        if (!local) return;
                        const schoolName = verifiedSchool?.name || form.staffSchoolName.trim();
                        if (!schoolName) {
                          setSchoolEmailStatus('Andika izina ry\'ishuri mbere.');
                          return;
                        }
                        try {
                          const params = new URLSearchParams({ local });
                          if (verifiedSchool?.code) {
                            params.set('code', String(verifiedSchool.code).trim().toUpperCase());
                          } else {
                            params.set('school_name', schoolName);
                          }
                          const r = await api.get(`/auth/check-school-email?${params}`);
                          setSchoolEmailPreview(r.email);
                          setSchoolEmailStatus(
                            r.available ? `✓ ${r.email} is available` : `✗ ${r.email} is already taken`
                          );
                        } catch (err) {
                          setSchoolEmailStatus(err.message);
                        }
                      }}
                      placeholder="john.doe"
                      required
                      className="auth-school-email-local"
                    />
                    <span className="auth-school-email-domain">
                      @
                      {verifiedSchool?.email_domain
                        || schoolDomainFromName(form.staffSchoolName)
                        || 'schoolname.edu'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    Injira ukoresheje <strong>username@izinaryishuri.edu</strong> — izina ry&apos;ishuri hejuru rigena aderesi yawe.
                  </p>
                  {schoolEmailPreview && (
                    <p style={{ fontSize: 12, marginTop: 4, color: '#0f766e' }}>
                      Imeyili yo kwinjira: <strong>{schoolEmailPreview}</strong>
                    </p>
                  )}
                  {schoolEmailStatus && (
                    <p style={{ fontSize: 12, marginTop: 4, color: schoolEmailStatus.startsWith('✓') ? '#059669' : '#dc2626' }}>
                      {schoolEmailStatus}
                    </p>
                  )}
                </div>
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
      </div>
    </div>
  );
}

