import { useState, useEffect, Fragment } from 'react';
import { api } from '../../api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminGuests({ token }) {
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [marksByGuest, setMarksByGuest] = useState({});
  const [marksLoading, setMarksLoading] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => api.get('/admin/guests', token).then(setGuests).catch(() => {});
  useEffect(() => {
    load();
  }, [token]);

  const loadMarks = async (guestId) => {
    if (marksByGuest[guestId]) return;
    setMarksLoading(guestId);
    try {
      const data = await api.get(`/admin/guests/${guestId}/marks`, token);
      setMarksByGuest((prev) => ({ ...prev, [guestId]: data.attempts || [] }));
    } catch {
      setMarksByGuest((prev) => ({ ...prev, [guestId]: [] }));
    } finally {
      setMarksLoading(null);
    }
  };

  const toggleExpand = (id) => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) loadMarks(next);
  };

  const toggleSuspend = async (g) => {
    await fetch(`${BASE}/admin/guests/${g.id}/suspend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ suspended: !g.is_suspended }),
    });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Delete this guest account permanently?')) return;
    await fetch(`${BASE}/admin/guests/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  };

  const filtered = guests.filter(
    (g) =>
      g.name?.toLowerCase().includes(search.toLowerCase()) ||
      g.email?.toLowerCase().includes(search.toLowerCase()) ||
      (g.teachers || []).join(' ').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-card">
      <div className="admin-section-header">
        <h2 className="admin-section-title">👤 Guests ({guests.length})</h2>
        <input
          className="admin-input"
          style={{ maxWidth: 280 }}
          placeholder="Search name, email, teacher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
        People who signed up via a shared quiz link (<strong>@guest.umunsi.com</strong>). They can
        view that teacher&apos;s class materials and take all quizzes in those classes — not on the
        class roster or leaderboard.
      </p>

      {msg && (
        <div style={{ marginBottom: '1rem', color: '#16a34a', fontSize: '0.875rem' }}>{msg}</div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Teacher(s)</th>
              <th>Classes</th>
              <th>Quizzes taken</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-text">
                  No guests yet.
                </td>
              </tr>
            )}
            {filtered.map((g) => (
              <Fragment key={g.id}>
                <tr>
                  <td>
                    <strong>{g.name}</strong>
                  </td>
                  <td>{g.email}</td>
                  <td>{(g.teachers || []).join(', ') || '—'}</td>
                  <td>{g.classes_unlocked ?? 0}</td>
                  <td>{g.quizzes_taken ?? 0}</td>
                  <td>{g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <span className={`badge ${g.is_suspended ? 'badge-red' : 'badge-green'}`}>
                      {g.is_suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn-sm btn-outline"
                      onClick={() => toggleExpand(g.id)}
                    >
                      {expanded === g.id ? 'Hide' : 'Details'}
                    </button>
                    <button type="button" className="btn-sm btn-outline" onClick={() => toggleSuspend(g)}>
                      {g.is_suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                    <button type="button" className="btn-sm btn-danger" onClick={() => remove(g.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {expanded === g.id && (
                  <tr>
                    <td colSpan={8} style={{ background: '#f8fafc', padding: 16 }}>
                      <strong style={{ fontSize: 13 }}>Class access</strong>
                      {(g.access || []).length === 0 ? (
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>No classes unlocked yet.</p>
                      ) : (
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                          {g.access.map((a, i) => (
                            <li key={i} style={{ marginBottom: 6 }}>
                              <strong>{a.class_name}</strong>
                              {a.subject ? ` (${a.subject})` : ''} · Teacher: {a.teacher_name}
                              {a.via_quiz_title ? ` · First link quiz: ${a.via_quiz_title}` : ''}
                              {' · '}
                              {a.access_granted_at
                                ? new Date(a.access_granted_at).toLocaleString()
                                : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                      <strong style={{ fontSize: 13, display: 'block', marginTop: 16 }}>Quiz marks</strong>
                      {marksLoading === g.id ? (
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>Loading marks…</p>
                      ) : (marksByGuest[g.id] || []).length === 0 ? (
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>No quiz attempts yet.</p>
                      ) : (
                        <table className="admin-table" style={{ marginTop: 8, fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th>Quiz</th>
                              <th>Class</th>
                              <th>Teacher</th>
                              <th>Score</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marksByGuest[g.id].map((a) => (
                              <tr key={a.attempt_id}>
                                <td>{a.quiz_title}</td>
                                <td>{a.class_name}</td>
                                <td>{a.teacher_name}</td>
                                <td>
                                  {a.score}/{a.total}
                                </td>
                                <td>{a.attempted_at ? new Date(a.attempted_at).toLocaleString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
