import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../utils/roles';
import AuthAppShell from '../components/AuthAppShell';
import { SCHOOL_EMAIL_IN_APP_HELP } from '../utils/schoolEmailHelp';
import './Auth.css';

export default function InviteSignup() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const parentToken = searchParams.get('parent_token') || '';
  const { login } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [form, setForm] = useState({
    name: '',
    email: '',
    schoolEmailLocal: '',
    password: '',
    phone: '',
    new_school_name: '',
    new_school_location: '',
  });
  const [schoolEmailPreview, setSchoolEmailPreview] = useState('');
  const [schoolEmailStatus, setSchoolEmailStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isParentInvite = Boolean(parentToken);

  useEffect(() => {
    if (!token && !parentToken) {
      setLoadError('Missing invitation token.');
      setLoadingPreview(false);
      return;
    }
    const load = isParentInvite
      ? api.get(`/parent/invite-preview?token=${encodeURIComponent(parentToken)}`)
      : api.get(`/auth/invite-preview?token=${encodeURIComponent(token)}`);
    load
      .then(setPreview)
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoadingPreview(false));
  }, [token, parentToken, isParentInvite]);

  const staffInvite =
    !isParentInvite && (preview?.role === 'teacher' || preview?.role === 'head_teacher');
  const inviteSchoolDomain =
    preview?.email_domain ||
    (preview?.can_create_school && form.new_school_name
      ? `${form.new_school_name.toLowerCase().replace(/[^a-z0-9]/g, '')}.edu`
      : null);

  const roleLabel = isParentInvite
    ? 'Parent'
    : preview?.role === 'head_teacher'
      ? 'Head Teacher'
      : preview?.role === 'teacher'
        ? preview?.invite_type === 'co_teacher'
          ? 'Co-Teacher'
          : 'Teacher'
        : 'User';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        password: form.password,
        phone: form.phone || undefined,
      };
      if (isParentInvite) {
        payload.parent_token = parentToken;
        payload.role = 'parent';
        payload.email = form.email.trim().toLowerCase();
      } else if (staffInvite) {
        payload.role = preview.role;
        payload.invite_token = token;
        payload.new_school_name = preview.can_create_school ? form.new_school_name : undefined;
        payload.new_school_location = preview.can_create_school ? form.new_school_location : undefined;
        payload.school_email_local = form.schoolEmailLocal.trim();
        if (!payload.school_email_local) {
          setError('Create your school email username.');
          setSubmitting(false);
          return;
        }
      } else {
        payload.role = preview.role;
        payload.invite_token = token;
        payload.email = form.email.trim().toLowerCase();
      }

      const data = await api.post('/auth/register', payload);

      if (data.pending) {
        if (data.login_email) setSchoolEmailPreview(data.login_email);
        setPending(true);
        return;
      }

      login(data.token, data.user);
      navigate(dashboardPath(data.user.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <AuthAppShell title="Loading…" subtitle="Checking your invitation">
        <p>Loading invitation...</p>
      </AuthAppShell>
    );
  }

  if (loadError || !preview) {
    return (
      <AuthAppShell title="Invalid invitation" subtitle={loadError || 'This link is not valid.'}>
        <Link to="/register" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>Go to signup</Link>
      </AuthAppShell>
    );
  }

  return (
    <AuthAppShell
      title={pending ? 'Account submitted' : `${roleLabel} signup`}
      subtitle={
        pending
          ? 'Waiting for approval — Dean (Our AI Support) can help after you sign in'
          : isParentInvite
            ? `Parent invite for ${preview.student_name}`
            : 'Complete your account — same look as inside the app'
      }
      footer={<p>Already have an account? <Link to="/login">Sign in</Link></p>}
    >
        {pending ? (
          <>
            <p className="auth-app-shell__sub">
              Your {roleLabel} account is waiting for approval. You will be able to log in once approved.
              {schoolEmailPreview && (
                <>
                  <br />
                  Use: <strong>{schoolEmailPreview}</strong>
                </>
              )}
            </p>
            <Link to="/login" className="btn btn-primary btn-full">Go to login</Link>
          </>
        ) : (
          <>
            <p className="auth-app-shell__sub">
              {isParentInvite
                ? 'Create your parent account to view your child\'s classroom work only.'
                : 'Complete your account using this invitation.'}
            </p>

            <section style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              {isParentInvite ? (
                <p style={{ margin: 0, color: '#1e40af' }}>
                  <strong>Child:</strong> {preview.student_name}
                  <br />You will only see this student&apos;s posts and their teachers&apos; updates.
                </p>
              ) : preview.can_create_school ? (
                <p style={{ margin: 0, color: '#1e40af' }}>
                  <strong>Create your school</strong> — register as Head Teacher for a new school.
                </p>
              ) : (
                <p style={{ margin: 0, color: '#1e40af' }}>
                  <strong>School:</strong> {preview.school_name}
                  {preview.class_name && <><br /><strong>Class:</strong> {preview.class_name} (co-teacher)</>}
                  {preview.school_code && <><br /><strong>School code:</strong> {preview.school_code}</>}
                </p>
              )}
            </section>

            {error && <p className="alert alert-error">{error}</p>}

            <form onSubmit={handleSubmit}>
              {!isParentInvite && preview.can_create_school && (
                <>
                  <label className="form-group">
                    School name *
                    <input required value={form.new_school_name} onChange={(e) => setForm({ ...form, new_school_name: e.target.value })} />
                  </label>
                  <label className="form-group">
                    School location
                    <input value={form.new_school_location} onChange={(e) => setForm({ ...form, new_school_location: e.target.value })} />
                  </label>
                </>
              )}
              <label className="form-group">
                Full name *
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              {staffInvite ? (
                <label className="form-group">
                  School email (your login) *
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <input
                      required
                      value={form.schoolEmailLocal}
                      onChange={(e) => {
                        setForm({ ...form, schoolEmailLocal: e.target.value });
                        setSchoolEmailStatus('');
                      }}
                      onBlur={async () => {
                        const local = form.schoolEmailLocal.trim();
                        if (!local || !preview.school_code) return;
                        try {
                          const r = await api.get(
                            `/auth/check-school-email?local=${encodeURIComponent(local)}&code=${encodeURIComponent(preview.school_code)}`
                          );
                          setSchoolEmailPreview(r.email);
                          setSchoolEmailStatus(r.available ? `✓ ${r.email}` : '✗ Already taken');
                        } catch (err) {
                          setSchoolEmailStatus(err.message);
                        }
                      }}
                      placeholder="john.doe"
                      style={{ flex: '1 1 140px' }}
                    />
                    <span style={{ fontWeight: 600, color: '#475569' }}>
                      @{inviteSchoolDomain || 'school.edu'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    {SCHOOL_EMAIL_IN_APP_HELP}
                  </p>
                  {schoolEmailStatus && (
                    <span style={{ fontSize: 12, color: schoolEmailStatus.startsWith('✓') ? '#059669' : '#dc2626' }}>
                      {schoolEmailStatus}
                    </span>
                  )}
                </label>
              ) : (
                <label className="form-group">
                  {isParentInvite ? 'Personal email (Gmail, Yahoo, Outlook…) *' : 'Email *'}
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder={isParentInvite ? 'you@gmail.com' : undefined}
                  />
                  {isParentInvite && (
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                      Use your real personal email (Gmail, Yahoo, Outlook, etc.). School @ addresses are for teachers only.
                    </p>
                  )}
                </label>
              )}
              <label className="form-group">
                Password *
                <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
              <label className="form-group">
                {isParentInvite ? 'Mobile phone for SMS alerts *' : 'Phone (optional)'}
                <input
                  type="tel"
                  required={isParentInvite}
                  placeholder={isParentInvite ? '078 123 4567' : undefined}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                {isParentInvite && (
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    Rwanda MTN/Airtel number — we text you when teachers post homework or class updates.
                  </p>
                )}
              </label>
              <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                {submitting ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          </>
        )}
    </AuthAppShell>
  );
}
