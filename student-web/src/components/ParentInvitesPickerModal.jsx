import { useState, useEffect } from 'react';
import { loadInvitableStudents } from '../utils/parentInviteApi';
import { MODAL_CARD_STYLE, MODAL_OVERLAY_STYLE } from '../utils/modalOverlay';
import ParentInviteModal from './ParentInviteModal';

/**
 * Pick a student and open the parent invite link modal (copy + WhatsApp).
 */
export default function ParentInvitesPickerModal({ token, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await loadInvitableStudents(token);
        if (!cancelled) setStudents(rows);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load students.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const q = filter.trim().toLowerCase();
  const filtered = q
    ? students.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.class_name?.toLowerCase().includes(q)
      )
    : students;

  const byClass = filtered.reduce((acc, s) => {
    const key = s.class_name || 'Class';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  if (selected) {
    return (
      <ParentInviteModal
        token={token}
        studentId={selected.id}
        studentName={selected.name}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <div
      style={{ ...MODAL_OVERLAY_STYLE, zIndex: 5000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ ...MODAL_CARD_STYLE, maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>👪 Parent invites</h2>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          Choose a student. You will get a link to share on WhatsApp — parents only see that child&apos;s work.
        </p>

        {loading && <p style={{ color: '#64748b' }}>Loading students…</p>}
        {error && <p className="alert alert-error">{error}</p>}

        {!loading && !error && students.length === 0 && (
          <p style={{ color: '#64748b' }}>
            No students in your classes yet. Add students to a class first, then return here.
          </p>
        )}

        {!loading && students.length > 0 && (
          <>
            <input
              type="search"
              placeholder="Search by name or class…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16,
              }}
            />
            {Object.keys(byClass).length === 0 && (
              <p className="phub-muted">No matches for &quot;{filter}&quot;</p>
            )}
            {Object.entries(byClass).map(([className, list]) => (
              <section key={className} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 8px', textTransform: 'uppercase' }}>
                  {className}
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map((s) => (
                    <li key={`${s.class_id}-${s.id}`}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}
                        onClick={() => setSelected({ id: s.id, name: s.name })}
                      >
                        <span>{s.name}</span>
                        <span style={{ opacity: 0.7 }}>Get link →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <button type="button" className="btn btn-outline" style={{ marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
