import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import { schoolMailDomainFromName, buildSchoolEmailPreview } from '../utils/schoolDomain';
import {
  SCHOOL_EMAIL_IN_APP_HELP,
  SCHOOL_EMAIL_FORWARD_HELP,
  STUDENT_EMAIL_HELP,
} from '../utils/schoolEmailHelp';
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
  const [schoolMailEnabled, setSchoolMailEnabled] = useState(true);
  const [personalEmail, setPersonalEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [forwardToken, setForwardToken] = useState('');
  const [forwardStatus, setForwardStatus] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/auth/schools').then(setSchools).catch(() => {});
    api.get('/mail/status').then((s) => setSchoolMailEnabled(s.enabled !== false)).catch(() => {});
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
        if (schoolMailEnabled && !forwardToken) {
          setError('Verify your personal Gmail, Yahoo, or Outlook first (code below).');
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
        if (schoolMailEnabled && forwardToken) {
          payload.forward_token = forwardToken;
        }
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
              <br />
              <span style={{ fontSize: 13, color: '#64748b' }}>{SCHOOL_EMAIL_IN_APP_HELP}</span>
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
                Create a real school email for UClass, Cursor, and other sites — copies go to your personal inbox.
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
                      const dom = schoolMailDomainFromName(e.target.value, schoolMailEnabled);
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
                        const dom =
                          verifiedSchool?.email_domain
                          || schoolMailDomainFromName(form.staffSchoolName, schoolMailEnabled);
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
                            r.available
                              ? `✓ ${r.email} — login + UClass messages`
                              : `✗ ${r.email} is already taken`
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
                        || schoolMailDomainFromName(form.staffSchoolName, schoolMailEnabled)
                        || 'school.mail.umunsi.com'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    {SCHOOL_EMAIL_IN_APP_HELP}
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
                {schoolMailEnabled && (
                  <div className="form-group" style={{ background: '#f8fafc', padding: 12, borderRadius: 10 }}>
                    <label>Personal email (Gmail, Yahoo, Outlook)</label>
                    <input
                      type="email"
                      value={personalEmail}
                      onChange={(e) => {
                        setPersonalEmail(e.target.value);
                        setForwardToken('');
                        setForwardStatus('');
                      }}
                      placeholder="you@gmail.com"
                      required
                    />
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                      {SCHOOL_EMAIL_FORWARD_HELP}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={sendingCode || !personalEmail.trim()}
                        onClick={async () => {
                          setSendingCode(true);
                          setForwardStatus('');
                          try {
                            const r = await api.post('/auth/school-mail/send-code', {
                              personal_email: personalEmail.trim().toLowerCase(),
                            });
                            setForwardStatus(
                              r.dev_code
                                ? `Dev code: ${r.dev_code}`
                                : 'Code sent — check your personal inbox.'
                            );
                          } catch (err) {
                            setForwardStatus(err.message);
                          } finally {
                            setSendingCode(false);
                          }
                        }}
                      >
                        {sendingCode ? 'Sending…' : 'Send code'}
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        placeholder="6-digit code"
                        style={{ flex: '1 1 120px', padding: '8px 10px' }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!verifyCode.trim() || !personalEmail.trim()}
                        onClick={async () => {
                          setForwardStatus('');
                          try {
                            const r = await api.post('/auth/school-mail/confirm-code', {
                              personal_email: personalEmail.trim().toLowerCase(),
                              code: verifyCode.trim(),
                            });
                            setForwardToken(r.forward_token);
                            setForwardStatus(`✓ Linked to ${r.forward_to}`);
                          } catch (err) {
                            setForwardToken('');
                            setForwardStatus(err.message);
                          }
                        }}
                      >
                        Verify
                      </button>
                    </div>
                    {forwardStatus && (
                      <p
                        style={{
                          fontSize: 12,
                          marginTop: 8,
                          color: forwardStatus.startsWith('✓') ? '#059669' : '#dc2626',
                        }}
                      >
                        {forwardStatus}
                      </p>
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
                        const vr = await api.post('/auth/validate-email', {
                          email: em,
                          school_id: form.school_id || verifiedSchool?.id || undefined,
                        });
                        setStudentEmailStatus(
                          vr.capabilities?.summary
                            ? `✓ ${vr.capabilities.summary}`
                            : '✓ Email looks valid'
                        );
                      } catch (err) {
                        setStudentEmailStatus(err.message);
                      }
                    }}
                    placeholder="you@gmail.com"
                    required
                  />
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    {STUDENT_EMAIL_HELP}
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

