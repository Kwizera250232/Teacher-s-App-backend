import { useState, useEffect } from 'react';
import { api } from '../api';
import VerifiedBadge from './VerifiedBadge';

/** Share a note with a verified teacher at the same school */
export default function NoteColleagueShareModal({ classId, noteId, noteTitle, onClose, onSent, token }) {
  const [colleagues, setColleagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recipientId, setRecipientId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/note-teacher-shares/colleagues', token)
      .then((rows) => {
        setColleagues(rows);
        if (rows.length) setRecipientId(String(rows[0].id));
      })
      .catch((e) => setError(e.message || 'Could not load school teachers.'))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!recipientId) {
      setError('Choose a teacher at your school.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(
        `/note-teacher-shares/from-class/${classId}/notes/${noteId}`,
        { recipient_teacher_id: Number(recipientId), message: message.trim() || undefined },
        token
      );
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Could not send share request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cm-modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', color: '#075e54' }}>
          Share note with a colleague
        </h2>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          {noteTitle ? `"${noteTitle}"` : 'This note'} will be sent to another <strong>verified teacher</strong> at
          your school. They must accept before their students can see it.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <p className="phub-muted">Loading teachers at your school…</p>
        ) : colleagues.length === 0 ? (
          <p className="phub-muted">
            No other verified teachers at your school yet. Join a school or wait for colleagues to be approved.
          </p>
        ) : (
          <form onSubmit={submit}>
            <label className="form-group">
              Teacher
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                required
                disabled={busy}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10 }}
              >
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.role === 'head_teacher' ? 'Head teacher' : 'Teacher'})
                  </option>
                ))}
              </select>
            </label>
            {recipientId && (() => {
              const picked = colleagues.find((c) => String(c.id) === String(recipientId));
              if (!picked) return null;
              return (
                <p style={{ fontSize: 13, color: '#475569', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {picked.name}
                  {picked.is_verified && (
                    <VerifiedBadge
                      size={14}
                      info={{
                        items: [
                          { icon: '✓', label: 'Verified', value: 'Approved teacher at your school' },
                          { icon: '👤', label: 'Role', value: picked.role === 'head_teacher' ? 'Head teacher' : 'Teacher' },
                        ],
                      }}
                    />
                  )}
                </p>
              );
            })()}
            <label className="form-group">
              Message (optional)
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={busy}
                placeholder="e.g. Please share this note with your S3 class."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
