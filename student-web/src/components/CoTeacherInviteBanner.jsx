import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

/**
 * Banner shown to teachers who have pending co-teacher invitations.
 * Accept → becomes co-teacher (class appears on dashboard, email confirmation sent).
 */
export default function CoTeacherInviteBanner({ token, onChanged }) {
  const [invites, setInvites] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!token) return;
    api.get('/classroom-feed/co-teacher-invites/mine', token)
      .then((res) => setInvites(Array.isArray(res) ? res : []))
      .catch(() => setInvites([]));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const respond = async (inviteId, action) => {
    setBusyId(inviteId);
    try {
      await api.post(`/classroom-feed/co-teacher-invites/${inviteId}/${action}`, {}, token);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      onChanged?.();
    } catch (e) {
      alert(e.message || 'Could not respond to the invite.');
    } finally {
      setBusyId(null);
    }
  };

  if (!invites.length) return null;

  return (
    <div className="co-teacher-invite-banner" style={{
      background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
      border: '2px solid #818cf8', borderRadius: 12,
      padding: '1rem', marginBottom: '1rem',
    }}>
      <h4 style={{ margin: '0 0 0.5rem', color: '#3730a3' }}>🤝 Co-teacher invitation{invites.length > 1 ? 's' : ''}</h4>
      {invites.map((inv) => (
        <div key={inv.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '0.75rem', flexWrap: 'wrap',
          background: '#fff', borderRadius: 10, padding: '0.6rem 0.9rem', marginTop: '0.5rem',
        }}>
          <div style={{ fontSize: '0.92rem', color: '#1e293b' }}>
            <strong>{inv.inviter_name || 'A teacher'}</strong> invited you to co-manage{' '}
            <strong>{inv.class_name}</strong>
            {inv.class_subject ? ` (${inv.class_subject})` : ''}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busyId === inv.id}
              onClick={() => respond(inv.id, 'accept')}
            >
              ✅ Accept
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busyId === inv.id}
              onClick={() => respond(inv.id, 'decline')}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
