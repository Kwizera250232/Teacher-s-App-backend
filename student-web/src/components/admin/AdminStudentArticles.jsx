import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';

/** Strip leading pin emoji / legacy mojibake from article first line. */
function articleTitle(content) {
  const first = String(content || '').split('\n')[0] || '';
  return first
    .replace(/^[\u{1F4CC}\u{FE0F}\u{200D}]+\s*/gu, '')
    .replace(/^📌\s*/, '')
    .replace(/^[\x00-\x1F]+/, '')
    .trim() || 'Untitled';
}

export default function AdminStudentArticles({ token }) {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewText, setReviewText] = useState({});
  const [savingId, setSavingId] = useState(null);

  const counts = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, { pending: 0, approved: 0, declined: 0 });
  }, [rows]);

  const load = () => {
    setLoading(true);
    setError('');
    api.get(`/admin/student-shares?status=${status}`, token)
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message || 'Failed to load student articles.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status]);

  const moderate = async (id, decision) => {
    setSavingId(id);
    setError('');
    try {
      const note = (reviewText[id] || '').trim();
      if (decision === 'declined' && !note) {
        setError('Please enter a decline reason.');
        return;
      }
      await api.put(`/admin/student-shares/${id}/moderate`, { decision, review_note: note }, token);
      setRows(prev => prev.filter(r => r.id !== id));
      setReviewText(prev => ({ ...prev, [id]: '' }));
    } catch (e) {
      setError(e.message || 'Moderation failed.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-section-header">
        <h2 className="admin-section-title">Student Articles Review</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { key: 'pending', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'declined', label: 'Declined' },
            { key: 'all', label: 'All' },
          ].map(t => (
            <button key={t.key} className={`btn-sm ${status === t.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setStatus(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="badge badge-blue">Pending: {counts.pending || 0}</span>
        <span className="badge badge-green">Approved: {counts.approved || 0}</span>
        <span className="badge badge-red">Declined: {counts.declined || 0}</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <p className="empty-text">Loading...</p> : null}

      {!loading && rows.length === 0 && (
        <p className="empty-text">No articles for this filter.</p>
      )}

      {!loading && rows.map(a => {
        const lines = String(a.content || '').split('\n');
        const title = articleTitle(a.content);
        const shortText = lines.slice(1).join(' ').slice(0, 260);
        return (
          <div key={a.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{title}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Student: {a.student_name} ({a.student_email})
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  School: {a.school || '—'} · Class: {a.class_name || '—'} · Teacher: {a.teacher_name || '—'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {new Date(a.created_at).toLocaleString()} · status: {a.status}
                </div>
              </div>
              {a.status === 'declined' && a.review_note && (
                <div style={{ fontSize: 12, color: '#991b1b', background: '#fee2e2', borderRadius: 6, padding: '6px 10px', maxWidth: 320 }}>
                  Decline reason: {a.review_note}
                </div>
              )}
            </div>

            <p style={{ marginTop: 8, color: '#334155', fontSize: 13, lineHeight: 1.55 }}>
              {shortText}{String(a.content || '').length > 260 ? '...' : ''}
            </p>

            {a.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="admin-input"
                  style={{ maxWidth: 360 }}
                  placeholder="Decline reason (required only if declining)"
                  value={reviewText[a.id] || ''}
                  onChange={e => setReviewText(prev => ({ ...prev, [a.id]: e.target.value }))}
                />
                <button className="btn-sm btn-success" disabled={savingId === a.id} onClick={() => moderate(a.id, 'approved')}>
                  Approve
                </button>
                <button className="btn-sm btn-danger" disabled={savingId === a.id} onClick={() => moderate(a.id, 'declined')}>
                  Decline
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
