import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Teacher picks a quiz + one or more groups. Group members do the quiz together and submit once.
 */
export default function AssignWorkToGroupModal({
  classId,
  token,
  quiz: presetQuiz,
  presetGroupIds,
  onClose,
  onAssigned,
  onCreateQuiz,
}) {
  const [quizzes, setQuizzes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(presetQuiz?.id ?? null);
  const [selectedGroups, setSelectedGroups] = useState(() => new Set(presetGroupIds || []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/classes/${classId}/quizzes`, token).catch(() => []),
      api.get(`/classes/${classId}/classroom`, token).catch(() => ({ groups: [] })),
    ])
      .then(([quizList, classroom]) => {
        const list = Array.isArray(quizList) ? quizList.filter((q) => !q.is_shared) : [];
        setQuizzes(list);
        setGroups(classroom?.groups || []);
        if (!presetQuiz?.id && list.length === 1) {
          setSelectedQuizId(list[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [classId, token, presetQuiz?.id]);

  const toggleGroup = (id) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedQuiz = quizzes.find((q) => q.id === selectedQuizId) || presetQuiz;

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedQuizId) {
      setError('Choose a quiz for the group to do.');
      return;
    }
    if (!selectedGroups.size) {
      setError('Choose at least one group to share this work with.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(
        `/classes/${classId}/group-quizzes`,
        { quiz_id: selectedQuizId, group_ids: [...selectedGroups] },
        token
      );
      onAssigned?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Assign work to group</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          Pick a <strong>quiz</strong> and the <strong>group(s)</strong> that will do it together. Any group member can open the work, answer as a team, and submit once for everyone.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <p style={{ padding: 16, color: '#888' }}>Loading…</p>
        ) : (
          <form onSubmit={submit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>
                1. Quiz to assign
              </label>
              {presetQuiz ? (
                <div style={{ padding: '10px 12px', background: '#f8f9ff', borderRadius: 10, border: '2px solid #667eea' }}>
                  <strong>{presetQuiz.title}</strong>
                </div>
              ) : quizzes.length === 0 ? (
                <div style={{ padding: 12, background: '#f8fafc', borderRadius: 10, fontSize: 14, color: '#64748b' }}>
                  No quizzes in this class yet.{' '}
                  {onCreateQuiz ? (
                    <button type="button" className="btn btn-link" style={{ padding: 0, fontWeight: 600 }} onClick={onCreateQuiz}>
                      Create a quiz first
                    </button>
                  ) : (
                    'Create one on the Quizzes tab first.'
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                  {quizzes.map((q) => (
                    <label
                      key={q.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        border: selectedQuizId === q.id ? '2px solid #667eea' : '1px solid #e5e7eb',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: selectedQuizId === q.id ? '#f8f9ff' : '#fff',
                      }}
                    >
                      <input
                        type="radio"
                        name="group-work-quiz"
                        checked={selectedQuizId === q.id}
                        onChange={() => setSelectedQuizId(q.id)}
                      />
                      <span style={{ fontWeight: 600 }}>{q.title}</span>
                      {q.description && (
                        <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.description}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>
                2. Share with group(s)
              </label>
              {groups.length === 0 ? (
                <p style={{ padding: 12, background: '#f8fafc', borderRadius: 10, fontSize: 14, color: '#64748b', margin: 0 }}>
                  No groups yet. Create groups on the <strong>Students</strong> tab → <strong>Add group</strong>.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {groups.map((g) => {
                    const memberCount = g.student_ids?.length || 0;
                    const empty = memberCount === 0;
                    return (
                      <label
                        key={g.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          border: selectedGroups.has(g.id) ? '2px solid #667eea' : '1px solid #e5e7eb',
                          borderRadius: 10,
                          cursor: empty ? 'not-allowed' : 'pointer',
                          background: selectedGroups.has(g.id) ? '#f8f9ff' : '#fff',
                          opacity: empty ? 0.55 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroups.has(g.id)}
                          disabled={empty}
                          onChange={() => !empty && toggleGroup(g.id)}
                        />
                        <span style={{ fontWeight: 600 }}>{g.name}</span>
                        <span style={{ fontSize: 12, color: empty ? '#dc2626' : '#888' }}>
                          {empty ? 'No students — add members first' : `${memberCount} students`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedQuiz && selectedGroups.size > 0 && (
              <p style={{ fontSize: 13, color: '#059669', margin: '0 0 12px', background: '#f0fdf4', padding: '10px 12px', borderRadius: 8 }}>
                <strong>{selectedQuiz.title}</strong> will be shared with{' '}
                <strong>{selectedGroups.size}</strong> group{selectedGroups.size > 1 ? 's' : ''}. Students open <strong>Groups</strong> on their dashboard or class page to start and submit together.
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={saving || !selectedQuizId || !selectedGroups.size}
            >
              {saving ? 'Assigning…' : 'Assign work to selected groups'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
