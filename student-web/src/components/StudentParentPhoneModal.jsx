import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Teacher/HT: view linked parents and set SMS phone for a student.
 */
export default function StudentParentPhoneModal({ token, classId, studentId, studentName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [phone, setPhone] = useState('');
  const [parentId, setParentId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get(`/parent/class/${classId}/parent-phones`, token)
      .then((res) => {
        setData(res);
        const row = (res.students || []).find((s) => s.student_id === studentId);
        const parent = row?.parents?.[0];
        if (parent) {
          setParentId(parent.parent_id);
          setPhone(parent.parent_phone || '');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, classId, studentId]);

  const onSave = async (e) => {
    e.preventDefault();
    if (!parentId) {
      setError('No parent account linked yet. Send a parent invite link first.');
      return;
    }
    setSaving(true);
    setError('');
    setOk('');
    try {
      await api.put(
        `/parent/students/${studentId}/parent-phone`,
        { phone, parent_id: parentId },
        token
      );
      setOk('Parent phone saved. They will receive SMS when you post homework or class updates.');
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const row = (data?.students || []).find((s) => s.student_id === studentId);
  const parents = row?.parents || [];

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>📱 Parent SMS — {studentName}</h3>
        {!data?.sms_configured && (
          <p className="alert" style={{ background: '#fef3c7', color: '#92400e' }}>
            SMS is not configured on the server yet (Twilio). Phone numbers will be saved for when SMS is enabled.
          </p>
        )}
        {loading && <p>Loading…</p>}
        {!loading && parents.length === 0 && (
          <p style={{ color: '#64748b' }}>
            No parent has joined yet. Use <strong>Parent invite</strong> so they register, then add their mobile here.
          </p>
        )}
        {!loading && parents.length > 0 && (
          <>
            {parents.map((p) => (
              <p key={p.parent_id} style={{ fontSize: 14, color: '#475569', margin: '0 0 8px' }}>
                {p.parent_name || 'Parent'} — {p.parent_email || 'no email'}
                {p.phone_ready ? ' ✓ SMS ready' : ''}
              </p>
            ))}
            <form onSubmit={onSave}>
              <label className="form-group">
                Parent mobile (Rwanda)
                <input
                  type="tel"
                  required
                  placeholder="078 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save for SMS alerts'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Close
                </button>
              </div>
            </form>
          </>
        )}
        {error && <p className="alert alert-error" style={{ marginTop: 12 }}>{error}</p>}
        {ok && <p style={{ color: '#059669', marginTop: 12, fontSize: 14 }}>{ok}</p>}
        {parents.length === 0 && (
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
