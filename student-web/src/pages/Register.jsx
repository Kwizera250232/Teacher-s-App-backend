import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import { GMAIL_SIGNUP_HELP, STUDENT_EMAIL_HELP } from '../utils/schoolEmailHelp';
import './Auth.css';

export default function Register() {
  const [searchParams] = useSearchParams();
  const searchRole = searchParams.get('role');
  const classCode = searchParams.get('code') || '';

  const [step, setStep] = useState('role');
  const [selectedRole, setSelectedRole] = useState(
    ['head_teacher', 'teacher'].includes(searchRole) ? searchRole : 'student'
  );
  const [verifiedSchool] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    school_id: '',
    newSchool: '',
    staffSchoolName: '',
  });
  const [emailStatus, setEmailStatus] = useState('');

  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
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

      const email = form.email.trim().toLowerCase();
      if (!email) {
        setError('Andika aderesi ya Gmail.');
        setLoading(false);
        return;
      }

      const isStaff = selectedRole === 'teacher' || selectedRole === 'head_teacher';
      if (isStaff && !verifiedSchool && !form.staffSchoolName.trim()) {
        setError('Andika izina ry\'ishuri.');
        setLoading(false);
        return;
      }

      await api.post('/auth/validate-email', {
        email,
        school_id: schoolId || verifiedSchool?.id || undefined,
      });

      const payload = {
        name: form.name,
        email,
        password: form.password,
        role: selectedRole,
        school_id: verifiedSchool ? verifiedSchool.id : (schoolId || null),
        phone: form.phone || undefined,
      };

      if (!verifiedSchool && isStaff && form.staffSchoolName.trim()) {
        payload.staff_school_name = form.staffSchoolName.trim();
      }

      if (verifiedSchool?.code) {
        payload.school_code = String(verifiedSchool.code).trim().toUpperCase();
      }

      const data = await api.post('/auth/register', payload);

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

  const emailHelp =
    selectedRole === 'student' ? STUDENT_EMAIL_HELP : GMAIL_SIGNUP_HELP;

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">🎓</div>

        {step === 'role' ? (
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
                <option value="head_teacher">🏫 Umuyobozi w&apos;Ishuri (Head Teacher)</option>
                <option value="teacher">👨‍🏫 Umwarimu (Teacher)</option>
              </select>
            </div>

            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
              {GMAIL_SIGNUP_HELP}
            </p>

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
            <p className="auth-sub">Injira mu rubuga rw&apos;inyigisho</p>
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

              {(selectedRole === 'teacher' || selectedRole === 'head_teacher') && (
                <div className="form-group">
                  <label>Izina ry&apos;ishuri</label>
                  <input
                    type="text"
                    value={verifiedSchool ? verifiedSchool.name : form.staffSchoolName}
                    onChange={(e) => {
                      if (verifiedSchool) return;
                      setForm({ ...form, staffSchoolName: e.target.value });
                    }}
                    readOnly={Boolean(verifiedSchool)}
                    placeholder="e.g. Green Hills Academy"
                    required={!verifiedSchool}
                    style={verifiedSchool ? { background: '#f1f5f9' } : undefined}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Imeyili ya Gmail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    setEmailStatus('');
                  }}
                  onBlur={async () => {
                    const em = form.email.trim().toLowerCase();
                    if (!em) return;
                    try {
                      await api.post('/auth/validate-email', {
                        email: em,
                        school_id: form.school_id || verifiedSchool?.id || undefined,
                      });
                      setEmailStatus('✓ Gmail irakora');
                    } catch (err) {
                      setEmailStatus(err.message);
                    }
                  }}
                  placeholder="amazina@gmail.com"
                  required
                />
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                  {emailHelp}
                </p>
                {emailStatus && (
                  <p
                    style={{
                      fontSize: 12,
                      marginTop: 4,
                      color: emailStatus.startsWith('✓') ? '#059669' : '#dc2626',
                    }}
                  >
                    {emailStatus}
                  </p>
                )}
              </div>

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
