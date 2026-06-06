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
  onClassAssigned,
  onCreateQuiz,
}) {
  const [quizzes, setQuizzes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(presetQuiz?.id ?? null);
  const [selectedGroups, setSelectedGroups] = useState(() => new Set(presetGroupIds || []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classSaving, setClassSaving] = useState(false);
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
  const busy = saving || classSaving;
  const canSubmit = Boolean(selectedQuizId && selectedGroups.size && !busy);
  const canAssignClass = Boolean(selectedQuizId && !busy);

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

  const assignToClass = async () => {
    if (!selectedQuizId) {
      setError('Choose a quiz first.');
      return;
    }
    setClassSaving(true);
    setError('');
    try {
      await api.post(`/classes/${classId}/quizzes/${selectedQuizId}/release-solo`, {}, token);
      onClassAssigned?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setClassSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay assign-group-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal assign-group-modal"
        style={{
          maxWidth: 520,
          width: '100%',
          height: loading ? 'auto' : 'min(92vh, 720px)',
          maxHeight: 'min(92vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px 12px', flexShrink: 0 }}>
          <div className="modal-header" style={{ marginBottom: 12 }}>
            <h2>Assign work to group</h2>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
            Pick a <strong>quiz</strong> for your <strong>group(s)</strong>, or assign it to the <strong>whole class</strong> so every student sees it on Quizzes.
          </p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ margin: '0 24px 8px', flexShrink: 0 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ padding: 24, color: '#888' }}>Loading…</p>
        ) : (
          <form
            id="assign-group-work-form"
            onSubmit={submit}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 16px', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>
                  1. Quiz to assign
                </label>
                {presetQuiz ? (
                  <div style={{ padding: '10px 12px', background: '#f8f9ff', borderRadius: 10, border: '2px solid #667eea' }}>
                    <strong>{presetQuiz.title}</strong>
                  </div>
                ) : quizzes.length === 0 ? (
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 10, fontSize: 14, color: '#64748b' }}>
                    No quizzes yet.{' '}
                    {onCreateQuiz ? (
                      <button type="button" className="btn btn-link" style={{ padding: 0, fontWeight: 600 }} onClick={onCreateQuiz}>
                        Create a quiz
                      </button>
                    ) : (
                      'Create one on the Quizzes tab.'
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
                    {quizzes.map((q) => (
                      <label
                        key={q.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
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
                          style={{ marginTop: 3 }}
                        />
                        <span style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>{q.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>
                  2. Share with group(s)
                </label>
                {groups.length === 0 ? (
                  <p style={{ padding: 12, background: '#f8fafc', borderRadius: 10, fontSize: 14, color: '#64748b', margin: 0 }}>
                    No groups yet. <strong>Students</strong> tab → <strong>Add group</strong>.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
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
                            {empty ? 'No students' : `${memberCount} students`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedQuiz && selectedGroups.size > 0 && (
                <p style={{ fontSize: 13, color: '#059669', margin: 0, background: '#f0fdf4', padding: '10px 12px', borderRadius: 8 }}>
                  <strong>{selectedQuiz.title}</strong> → <strong>{selectedGroups.size}</strong> group{selectedGroups.size > 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div
              className="assign-group-modal-footer"
              style={{
                flexShrink: 0,
                padding: '14px 24px 20px',
                borderTop: '1px solid #e5e7eb',
                background: '#fff',
                boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
              }}
            >
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={!canSubmit}
                style={{ minHeight: 48, fontSize: 16, fontWeight: 700 }}
              >
                {saving ? 'Releasing…' : 'Release quiz to selected groups'}
              </button>
              <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>or</span>
                <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-full"
                disabled={!canAssignClass}
                onClick={assignToClass}
                style={{ minHeight: 48, fontSize: 15, fontWeight: 700 }}
              >
                {classSaving ? 'Assigning…' : '📋 Assign it to class so all may see it'}
              </button>
              {!canSubmit && !busy && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                  For groups: select a quiz and at least one group with students. For class: pick a quiz only.
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
