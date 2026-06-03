import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import { schoolDomainFromName, signupEmailDomain, buildSchoolEmailPreview } from '../utils/schoolDomain';
import { SCHOOL_EMAIL_IN_APP_HELP, STUDENT_SCHOOL_EMAIL_HELP } from '../utils/schoolEmailHelp';
import AuthBackLink from '../components/AuthBackLink';
import './Auth.css';

export default function Register() {
  const [searchParams] = useSearchParams();
  const searchRole = searchParams.get('role');
  const classCode = searchParams.get('code') || '';
  const quizShareToken = searchParams.get('quiz_share') || '';
  const prefSchoolId = searchParams.get('school_id') || '';

  // step: 'role' → 'code' (if teacher/HT) → 'form'
  const [step, setStep] = useState('role');
  const [selectedRole, setSelectedRole] = useState(
    ['head_teacher', 'teacher', 'guest'].includes(searchRole) ? searchRole : 'student'
  );
  const [verifiedSchool, setVerifiedSchool] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    schoolEmailLocal: '',
    studentEmailLocal: '',
    guestEmailLocal: '',
    staffSchoolName: '',
    staffSchoolId: '',
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
    if (prefSchoolId) {
      setForm((f) => ({ ...f, school_id: prefSchoolId }));
      setSelectedRole((r) => (r === 'student' ? r : 'student'));
      setStep('form');
    }
  }, [prefSchoolId]);

  useEffect(() => {
    if (quizShareToken && ['student', 'teacher', 'head_teacher'].includes(searchRole)) {
      setSelectedRole(searchRole);
      setStep('form');
    } else if (quizShareToken) {
      setStep('form');
      setSelectedRole('student');
    }
  }, [quizShareToken, searchRole]);

  useEffect(() => {
    if (['head_teacher', 'teacher', 'guest'].includes(searchRole)) {
      setSelectedRole(searchRole);
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
      } else if (selectedRole === 'student') {
        if (!form.studentEmailLocal.trim()) {
          setError('Create your school email username.');
          setLoading(false);
          return;
        }
        if (!schoolId && !verifiedSchool?.id) {
          setError('Hitamo ishuri.');
          setLoading(false);
          return;
        }
      } else if (selectedRole === 'guest') {
        if (!form.guestEmailLocal.trim()) {
          setError('Choose a guest username.');
          setLoading(false);
          return;
        }
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
        if (!verifiedSchool && form.staffSchoolId) {
          payload.school_id = parseInt(form.staffSchoolId, 10) || null;
        }
        if (!verifiedSchool && !form.staffSchoolId && form.staffSchoolName.trim()) {
          payload.staff_school_name = form.staffSchoolName.trim();
        }
      } else if (selectedRole === 'student') {
        payload.school_email_local = form.studentEmailLocal.trim();
      } else if (selectedRole === 'guest') {
        payload.guest_email_local = form.guestEmailLocal.trim();
      }

      if (verifiedSchool?.code) {
        payload.school_code = String(verifiedSchool.code).trim().toUpperCase();
      }
      if (quizShareToken) {
        payload.quiz_share_token = quizShareToken;
      }

      const data = await api.post('/auth/register', payload);

      if (data.pending) {
        if (data.login_email) setSchoolEmailPreview(data.login_email);
        setPending(true);
        return;
      }

      login(data.token, data.user);
      const shareRedir = data.guest_share_redirect;
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
      if (data.user.role === 'guest') {
        navigate('/guest/dashboard', { replace: true });
        return;
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
    <div className="auth-container">
      <div className="auth-card">
        <AuthBackLink />
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
                <option value="head_teacher">🏫 Umuyobozi w'Ikigo (Head Teacher)</option>
                <option value="teacher">👨‍🏫 Umwarimu (Teacher)</option>
                <option value="guest">🔗 Guest (quiz share link)</option>
              </select>
            </div>

            {selectedRole === 'student' && (
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
                Students select their school from the list in the next step.
              </p>
            )}
            {(selectedRole === 'head_teacher' || selectedRole === 'teacher') && (
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
                Choose or type your school, then create your login as name@schoolname.edu.
              </p>
            )}
            {selectedRole === 'guest' && (
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
                Guest login uses <strong>@guest.umunsi.com</strong>. Open a teacher&apos;s quiz share link to unlock classes.
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
            {quizShareToken && (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 12,
                  fontSize: 13,
                  color: '#065f46',
                  lineHeight: 1.45,
                }}
              >
                You opened a <strong>shared quiz</strong> link. After signup you can take the quiz in your
                dashboard (students join the class; guests use a separate guest account on the share page).
              </div>
            )}
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
                {!verifiedSchool && (
                  <div className="form-group">
                    <label>Hitamo ishuri (optional)</label>
                    <select
                      value={form.staffSchoolId}
                      onChange={(e) => {
                        const id = e.target.value;
                        const picked = schools.find((s) => String(s.id) === id);
                        setForm({
                          ...form,
                          staffSchoolId: id,
                          staffSchoolName: picked ? picked.name : form.staffSchoolName,
                        });
                        setSchoolEmailStatus('');
                        if (form.schoolEmailLocal.trim() && picked) {
                          const dom = signupEmailDomain(picked);
                          if (dom) setSchoolEmailPreview(buildSchoolEmailPreview(form.schoolEmailLocal, dom));
                        }
                      }}
                    >
                      <option value="">— cyangwa wandike izina hepfo —</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Izina ry&apos;ishuri</label>
                  <input
                    type="text"
                    value={verifiedSchool ? verifiedSchool.name : form.staffSchoolName}
                    onChange={(e) => {
                      if (verifiedSchool) return;
                      setForm({ ...form, staffSchoolName: e.target.value, staffSchoolId: '' });
                      setSchoolEmailStatus('');
                      const dom = schoolDomainFromName(e.target.value);
                      if (form.schoolEmailLocal.trim() && dom) {
                        setSchoolEmailPreview(buildSchoolEmailPreview(form.schoolEmailLocal, dom));
                      }
                    }}
                    readOnly={Boolean(verifiedSchool)}
                    placeholder="e.g. Green Hills Academy"
                    required={!verifiedSchool && !form.staffSchoolId}
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
                        const pickedSchool = form.staffSchoolId
                          ? schools.find((s) => String(s.id) === form.staffSchoolId)
                          : null;
                        const dom =
                          signupEmailDomain(verifiedSchool || pickedSchool || { name: form.staffSchoolName });
                        if (local.trim() && dom) {
                          setSchoolEmailPreview(buildSchoolEmailPreview(local, dom));
                        }
                      }}
                      onBlur={async () => {
                        const local = form.schoolEmailLocal.trim();
                        if (!local) return;
                        const pickedSchool = form.staffSchoolId
                          ? schools.find((s) => String(s.id) === form.staffSchoolId)
                          : null;
                        const schoolName = verifiedSchool?.name || pickedSchool?.name || form.staffSchoolName.trim();
                        if (!schoolName && !pickedSchool && !verifiedSchool) {
                          setSchoolEmailStatus('Andika izina ry\'ishuri cyangwa uhitemo mu rutonde.');
                          return;
                        }
                        try {
                          const params = new URLSearchParams({ local });
                          if (verifiedSchool?.code) {
                            params.set('code', String(verifiedSchool.code).trim().toUpperCase());
                          } else if (pickedSchool?.id) {
                            params.set('school_id', String(pickedSchool.id));
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
                      {signupEmailDomain(
                        verifiedSchool
                          || (form.staffSchoolId
                            ? schools.find((s) => String(s.id) === form.staffSchoolId)
                            : null)
                          || { name: form.staffSchoolName }
                      ) || 'schoolname.edu'}
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
                </>
              ) : selectedRole === 'guest' ? (
                <>
                  <div className="form-group">
                    <label>Guest username (login)</label>
                    <div className="auth-school-email-row">
                      <input
                        type="text"
                        value={form.guestEmailLocal}
                        onChange={(e) => setForm({ ...form, guestEmailLocal: e.target.value })}
                        placeholder="yourname"
                        required
                        className="auth-school-email-local"
                      />
                      <span className="auth-school-email-domain">@guest.umunsi.com</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                      Use a quiz share link from your teacher to unlock classes after signup.
                    </p>
                  </div>
                </>
              ) : (
                <>
              <div className="form-group">
                <label>Ishuri</label>
                <select
                  value={form.school_id}
                  onChange={(e) => {
                    setForm({ ...form, school_id: e.target.value, newSchool: '' });
                    setStudentEmailStatus('');
                  }}
                  required={!form.newSchool.trim()}
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
              <div className="form-group">
                <label>Imeyili y&apos;ishuri (login)</label>
                <div className="auth-school-email-row">
                  <input
                    type="text"
                    value={form.studentEmailLocal}
                    onChange={(e) => {
                      setForm({ ...form, studentEmailLocal: e.target.value });
                      setStudentEmailStatus('');
                      const picked = schools.find((s) => String(s.id) === String(form.school_id));
                      const dom = signupEmailDomain(picked || { name: form.newSchool });
                      if (e.target.value.trim() && dom) {
                        setSchoolEmailPreview(buildSchoolEmailPreview(e.target.value, dom));
                      }
                    }}
                    onBlur={async () => {
                      const local = form.studentEmailLocal.trim();
                      const sid = form.school_id || null;
                      if (!local || !sid) return;
                      try {
                        const r = await api.get(
                          `/auth/check-school-email?local=${encodeURIComponent(local)}&school_id=${encodeURIComponent(sid)}`
                        );
                        setSchoolEmailPreview(r.email);
                        setStudentEmailStatus(
                          r.available ? `✓ ${r.email}` : `✗ ${r.email} is already taken`
                        );
                      } catch (err) {
                        setStudentEmailStatus(err.message);
                      }
                    }}
                    placeholder="john.doe"
                    required
                    className="auth-school-email-local"
                  />
                  <span className="auth-school-email-domain">
                    @
                    {signupEmailDomain(
                      schools.find((s) => String(s.id) === String(form.school_id))
                        || { name: form.newSchool }
                    ) || 'schoolname.edu'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                  {STUDENT_SCHOOL_EMAIL_HELP}
                </p>
                {schoolEmailPreview && (
                  <p style={{ fontSize: 12, marginTop: 4, color: '#0f766e' }}>
                    Imeyili yo kwinjira: <strong>{schoolEmailPreview}</strong>
                  </p>
                )}
                {studentEmailStatus && (
                  <p style={{ fontSize: 12, marginTop: 4, color: studentEmailStatus.startsWith('✓') ? '#059669' : '#dc2626' }}>
                    {studentEmailStatus}
                  </p>
                )}
              </div>
                </>
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

