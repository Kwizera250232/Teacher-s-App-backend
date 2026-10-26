import { useEffect, useState } from 'react';
import { api } from '../api';

/** Teacher picks a quiz + the class groups that should take it together (team quiz). */
export default function AssignQuizToGroupModal({ classId, token, quiz: presetQuiz, onClose, onAssigned }) {
  const [quizzes, setQuizzes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [quizId, setQuizId] = useState(presetQuiz?.id ?? null);
  const [picked, setPicked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/classes/${classId}/quizzes`, token).catch(() => []),
      api.get(`/classes/${classId}/classroom`, token).catch(() => ({ groups: [] })),
    ]).then(([qs, room]) => {
      setQuizzes((Array.isArray(qs) ? qs : []).filter((q) => !q.is_shared));
      setGroups((room?.groups || []).filter((g) => (g.member_count ?? g.members?.length ?? 1) > 0));
      setLoading(false);
    });
  }, [classId, token]);

  const toggle = (gid) => setPicked((p) => (p.includes(gid) ? p.filter((x) => x !== gid) : [...p, gid]));

  const assign = async () => {
    if (!quizId) return setError('Choose a quiz first.');
    if (!picked.length) return setError('Choose at least one group.');
    setSaving(true);
    setError('');
    try {
      await api.post(`/classes/${classId}/group-quizzes`, { quiz_id: quizId, group_ids: picked }, token);
      onAssigned?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const box = { padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: '#fff' };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>👥 Assign quiz to group</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 14 }}>
          Only students in the chosen group(s) work on it — they take it together inside their team.
        </p>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
        {loading ? (
          <p style={{ padding: 20, color: '#888' }}>Loading…</p>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {!presetQuiz && (
              <>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>Quiz</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {quizzes.length === 0 && <p style={{ fontSize: 14, color: '#64748b' }}>No quizzes yet — create one first.</p>}
                  {quizzes.map((q) => (
                    <label key={q.id} style={{ ...box, border: quizId === q.id ? '2px solid #7c3aed' : box.border, background: quizId === q.id ? '#f5f3ff' : '#fff' }}>
                      <input type="radio" name="gq" checked={quizId === q.id} onChange={() => setQuizId(q.id)} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{q.title}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>Groups</label>
            {groups.length === 0 ? (
              <p style={{ fontSize: 14, color: '#64748b' }}>No groups with students yet — create teams on the <strong>Students</strong> tab first.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groups.map((g) => (
                  <label key={g.id} style={{ ...box, border: picked.includes(g.id) ? '2px solid #7c3aed' : box.border, background: picked.includes(g.id) ? '#f5f3ff' : '#fff' }}>
                    <input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{g.member_count ?? g.members?.length ?? ''} students</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary btn-full"
          onClick={assign}
          disabled={saving || loading || !groups.length}
          style={{ marginTop: 14, minHeight: 48, fontSize: 16, fontWeight: 700 }}
        >
          {saving ? 'Assigning…' : `👥 Assign to ${picked.length || ''} group${picked.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
