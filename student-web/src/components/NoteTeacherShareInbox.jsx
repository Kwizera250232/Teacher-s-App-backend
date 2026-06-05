import { useState, useEffect } from 'react';
import { api } from '../api';
import VerifiedBadge from './VerifiedBadge';

export default function NoteTeacherShareInbox({ token, classes = [], onChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [classByShare, setClassByShare] = useState({});

  const load = () => {
    setLoading(true);
    api.get('/note-teacher-shares/inbox', token)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const accept = async (id) => {
    const targetClassId = classByShare[id] || (classes[0] && String(classes[0].id));
    if (!targetClassId) {
      alert('Create a class first, then choose where students should see this note.');
      return;
    }
    setActionLoading(id);
    try {
      await api.put(`/note-teacher-shares/${id}/accept`, { target_class_id: Number(targetClassId) }, token);
      load();
      onChange?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const decline = async (id) => {
    setActionLoading(id);
    try {
      await api.put(`/note-teacher-shares/${id}/decline`, {}, token);
      load();
      onChange?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <p className="phub-muted" style={{ marginBottom: 16 }}>Loading note share requests…</p>;
  }

  if (items.length === 0) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
      border: '1px solid #d97706',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>📄</span>
        <strong style={{ color: '#92400e', fontSize: 16 }}>
          Note shares from colleagues ({items.length})
        </strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((r) => (
          <div key={r.id} style={{
            background: 'white',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div>
              <strong style={{ fontSize: 15 }}>{r.note_title}</strong>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                From
                {' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {r.source_teacher_name}
                  {r.source_teacher_verified && (
                    <VerifiedBadge
                      size={13}
                      info={{
                        items: [
                          { icon: '✓', label: 'Verified teacher', value: 'Approved at your school' },
                          { icon: '📚', label: 'Class', value: r.source_class_name },
                        ],
                      }}
                    />
                  )}
                </span>
                · Class <strong>{r.source_class_name}</strong>
                {r.source_class_subject ? ` · ${r.source_class_subject}` : ''}
              </div>
              {r.message && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
                  &ldquo;{r.message}&rdquo;
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                Show in class:
                <select
                  value={classByShare[r.id] || (classes[0] ? String(classes[0].id) : '')}
                  onChange={(e) => setClassByShare((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  disabled={!classes.length || actionLoading === r.id}
                  style={{ padding: '6px 10px', borderRadius: 8 }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => accept(r.id)}
                disabled={actionLoading === r.id || !classes.length}
              >
                ✓ Accept
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => decline(r.id)}
                disabled={actionLoading === r.id}
              >
                ✕ Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
