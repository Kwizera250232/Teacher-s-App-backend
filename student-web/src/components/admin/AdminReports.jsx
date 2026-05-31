import { useState, useEffect } from 'react';
import { api } from '../../api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminReports({ token }) {
  const [reports, setReports] = useState([]);
  const [replyId, setReplyId] = useState(null);
  const [replyText, setReplyText] = useState('');

  const load = () => api.get('/admin/reports', token).then(setReports).catch(() => {});
  useEffect(() => { load(); }, []);

  const sendReply = async () => {
    if (!replyText.trim()) return;
    await fetch(`${BASE}/admin/reports/${replyId}/reply`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reply: replyText }),
    });
    setReplyId(null);
    setReplyText('');
    load();
  };

  const open = reports.filter(r => r.status === 'open');
  const resolved = reports.filter(r => r.status === 'resolved');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="admin-card">
        <h2 className="admin-section-title" style={{ marginBottom: '1rem' }}>💬 Open Reports ({open.length})</h2>
        {open.length === 0 && <p className="empty-text">No open reports.</p>}
        {open.map(r => (
          <div key={r.id} style={{ border: '1px solid #fde68a', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem', background: '#fffbeb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <strong>{r.subject}</strong>
                <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: '0.25rem' }}>
                  From: {r.user_name} ({r.user_email}) · {r.user_role} · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <span className="badge badge-yellow">Open</span>
            </div>
            <p style={{ margin: '0.75rem 0', color: '#475569', fontSize: '0.875rem' }}>{r.message}</p>
            {replyId === r.id ? (
              <div className="admin-form-row" style={{ marginTop: '0.5rem' }}>
                <textarea className="admin-input" style={{ minHeight: 80, resize: 'vertical' }} placeholder="Your reply..." value={replyText} onChange={e => setReplyText(e.target.value)} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-sm btn-primary" onClick={sendReply}>Send Reply</button>
                  <button className="btn-sm btn-outline" onClick={() => setReplyId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn-sm btn-primary" onClick={() => setReplyId(r.id)}>💬 Reply</button>
            )}
          </div>
        ))}
      </div>

      <div className="admin-card">
        <h2 className="admin-section-title" style={{ marginBottom: '1rem' }}>✅ Resolved ({resolved.length})</h2>
        {resolved.length === 0 && <p className="empty-text">No resolved reports.</p>}
        {resolved.map(r => (
          <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong>{r.subject}</strong>
              <span className="badge badge-green">Resolved</span>
            </div>
            <p style={{ margin: '0.5rem 0', color: '#475569', fontSize: '0.875rem' }}>{r.message}</p>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '0.75rem', fontSize: '0.875rem', color: '#166534' }}>
              <strong>Admin reply:</strong> {r.admin_reply}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
