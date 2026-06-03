import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import { buildSchoolEmailPreview } from '../utils/schoolDomain';
import './GuestUpgradeModal.css';

export default function GuestUpgradeModal({ open, onClose }) {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    schoolEmailLocal: '',
    staffSchoolName: '',
    classCode: '',
    studentEmailLocal: '',
  });

  if (!open) return null;

  const reset = () => {
    setStep('choose');
    setError('');
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitTeacher = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.post(
        '/guest/convert-account',
        {
          target_role: 'teacher',
          school_email_local: form.schoolEmailLocal.trim(),
          staff_school_name: form.staffSchoolName.trim(),
        },
        token
      );
      login(data.token, data.user);
      navigate(dashboardPath('teacher'), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitStudent = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.post(
        '/guest/convert-account',
        {
          target_role: 'student',
          school_email_local: form.studentEmailLocal.trim(),
          class_code: form.classCode.trim(),
        },
        token
      );
      login(data.token, data.user);
      if (data.joined_class?.id) {
        navigate(`/student/classes/${data.joined_class.id}`, { replace: true });
      } else {
        navigate(dashboardPath('student'), { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const teacherPreview = buildSchoolEmailPreview(
    form.schoolEmailLocal,
    form.staffSchoolName ? `${form.staffSchoolName.toLowerCase().replace(/[^a-z0-9]/g, '')}.edu` : 'schoolname.edu'
  );

  return (
    <div className="guest-upgrade-modal" role="dialog" aria-modal="true">
      <div className="guest-upgrade-modal__backdrop" onClick={handleClose} />
      <div className="guest-upgrade-modal__panel">
        <button type="button" className="guest-upgrade-modal__close" onClick={handleClose} aria-label="Close">
          ✕
        </button>

        {step === 'choose' && (
          <>
            <h2>Upgrade your account</h2>
            <p className="guest-upgrade-modal__lead">
              You are using a <strong>guest</strong> account from a shared quiz link. Keep your quiz scores and
              unlock the full UClass experience.
            </p>
            <p className="guest-upgrade-modal__question">Are you a teacher or a student?</p>
            <div className="guest-upgrade-modal__choices">
              <button type="button" className="guest-upgrade-card" onClick={() => setStep('teacher')}>
                <span className="guest-upgrade-card__icon">👨‍🏫</span>
                <strong>Umwarimu / Teacher</strong>
                <small>Create @schoolname.edu login and start managing classes</small>
              </button>
              <button type="button" className="guest-upgrade-card" onClick={() => setStep('student')}>
                <span className="guest-upgrade-card__icon">👨‍🎓</span>
                <strong>Umunyeshuri / Student</strong>
                <small>Join your class with a code and keep your guest quiz marks</small>
              </button>
            </div>
          </>
        )}

        {step === 'teacher' && (
          <>
            <h2>Become a Teacher</h2>
            <p className="guest-upgrade-modal__lead">
              Your guest quiz history stays saved. You will get a teacher dashboard to create classes.
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={submitTeacher} className="guest-upgrade-form">
              <label>
                School name
                <input
                  type="text"
                  value={form.staffSchoolName}
                  onChange={(e) => setForm({ ...form, staffSchoolName: e.target.value })}
                  placeholder="e.g. Demo High School"
                  required
                />
              </label>
              <label>
                School email username
                <div className="guest-upgrade-email-row">
                  <input
                    type="text"
                    value={form.schoolEmailLocal}
                    onChange={(e) => setForm({ ...form, schoolEmailLocal: e.target.value })}
                    placeholder="yourname"
                    required
                  />
                  <span>@schoolname.edu</span>
                </div>
              </label>
              {teacherPreview && (
                <p className="guest-upgrade-preview">
                  Login: <strong>{teacherPreview}</strong>
                </p>
              )}
              <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
                {busy ? 'Upgrading…' : 'Upgrade to Teacher →'}
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => setStep('choose')}>
                ← Back
              </button>
            </form>
          </>
        )}

        {step === 'student' && (
          <>
            <h2>Become a Student</h2>
            <p className="guest-upgrade-modal__lead">
              Enter your class code from your teacher, create your student email, and join the class roster.
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={submitStudent} className="guest-upgrade-form">
              <label>
                Class code (6 characters)
                <input
                  type="text"
                  value={form.classCode}
                  onChange={(e) => setForm({ ...form, classCode: e.target.value.toUpperCase() })}
                  placeholder="ABC123"
                  maxLength={6}
                  required
                />
              </label>
              <label>
                Student email username
                <input
                  type="text"
                  value={form.studentEmailLocal}
                  onChange={(e) => setForm({ ...form, studentEmailLocal: e.target.value })}
                  placeholder="name (becomes name@schoolname.edu)"
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
                {busy ? 'Joining…' : 'Upgrade to Student →'}
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => setStep('choose')}>
                ← Back
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
