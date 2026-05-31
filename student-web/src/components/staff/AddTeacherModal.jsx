import { useState } from 'react';
import { api } from '../../api';

export default function AddTeacherModal({ token, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [local, setLocal] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const checkEmail = async () => {
    if (!local.trim()) return;
    try {
      const r = await api.get(`/parent/school/teachers/email-preview?local=${encodeURIComponent(local.trim())}`, token);
      setPreview(r);
    } catch (e) {
      setError(e.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await api.post('/parent/school/teachers', {
        name: name.trim(),
        school_email_local: local.trim(),
      }, token);
      setResult(r);
      onCreated?.(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Add teacher</h2>
        {result ? (
          <>
            <p>Teacher created.</p>
            <p><strong>Login email:</strong> {result.user?.email}</p>
            <p><strong>Temp password:</strong> <code>{result.temp_password}</code></p>
            <button type="button" className="btn btn-primary btn-full" onClick={onClose}>Done</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="phub-muted" style={{ marginBottom: 12 }}>
              Enter the teacher&apos;s name and school email username. We show the full email before you save.
            </p>
            <label className="form-group">
              Full name
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jean de Dieu Kwizera" />
            </label>
            <label className="form-group">
              School email username
              <input
                required
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={checkEmail}
                placeholder="john.doe"
              />
            </label>
            {preview && (
              <p style={{ fontSize: 13, color: preview.available ? '#059669' : '#dc2626' }}>
                {preview.email} {preview.available ? '(available)' : '(taken)'}
              </p>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || preview?.available === false}>
                {loading ? 'Saving…' : 'Save teacher'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
