import { useState, useEffect } from 'react';
import { api } from '../api';

export default function SchoolRequestsPanel({ token }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/admin/school-requests', token)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const handleAction = async (id, action) => {
    setActionLoading(id);
    try {
      await api.put(`/admin/school-requests/${id}/${action}`, {}, token);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const pending = requests.filter(r => r.status === 'pending');

  if (loading) return <p className="phub-muted" style={{ marginBottom: 16 }}>Loading join requests…</p>;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
      border: '1px solid #f59e0b',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>📋</span>
        <strong style={{ color: '#92400e', fontSize: 16 }}>
          School Join Requests ({pending.length})
        </strong>
      </div>
      {pending.length === 0 ? (
        <p style={{ margin: 0, color: '#78350f', fontSize: 14 }}>No pending teacher requests. Teachers will appear here when they tap Join school on their dashboard.</p>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pending.map(r => (
          <div key={r.id} style={{
            background: 'white',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong style={{ fontSize: 14 }}>{r.teacher_name}</strong>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{r.teacher_email}</span>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
                Wants to join <strong>{r.school_name}</strong>
              </div>
              {r.message && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                  "{r.message}"
                </div>
              )}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleAction(r.id, 'approve')}
                disabled={actionLoading === r.id}
              >
                ✓ Approve
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleAction(r.id, 'reject')}
                disabled={actionLoading === r.id}
              >
                ✕ Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
