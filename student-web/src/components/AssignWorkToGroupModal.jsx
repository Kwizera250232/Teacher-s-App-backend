import { useEffect, useState } from 'react';
import { api } from '../api';

/** Teacher picks a quiz to show on the class Quizzes tab for every student. */
export default function AssignWorkToGroupModal({
  classId,
  token,
  quiz: presetQuiz,
  onClose,
  onClassAssigned,
  onCreateQuiz,
}) {
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(presetQuiz?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/classes/${classId}/quizzes`, token)
      .then((quizList) => {
        const list = Array.isArray(quizList) ? quizList.filter((q) => !q.is_shared) : [];
        setQuizzes(list);
        if (!presetQuiz?.id && list.length === 1) {
          setSelectedQuizId(list[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [classId, token, presetQuiz?.id]);

  const selectedQuiz = quizzes.find((q) => q.id === selectedQuizId) || presetQuiz;
  const canAssign = Boolean(selectedQuizId && !saving);

  const assignToClass = async (e) => {
    e.preventDefault();
    if (!selectedQuizId) {
      setError('Choose a quiz first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/classes/${classId}/quizzes/${selectedQuizId}/release-solo`, {}, token);
      onClassAssigned?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
          maxHeight: 'min(92vh, 640px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px 12px', flexShrink: 0 }}>
          <div className="modal-header" style={{ marginBottom: 12 }}>
            <h2>Assign quiz to class</h2>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
            Every student will see the quiz on their <strong>Quizzes</strong> tab and can take it.
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
          <form onSubmit={assignToClass} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 16px', WebkitOverflowScrolling: 'touch' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#374151' }}>
                Quiz to assign
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
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
                        name="class-quiz-pick"
                        checked={selectedQuizId === q.id}
                        onChange={() => setSelectedQuizId(q.id)}
                        style={{ marginTop: 3 }}
                      />
                      <span style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>{q.title}</span>
                    </label>
                  ))}
                </div>
              )}
              {selectedQuiz && (
                <p style={{ fontSize: 13, color: '#059669', margin: '12px 0 0', background: '#f0fdf4', padding: '10px 12px', borderRadius: 8 }}>
                  <strong>{selectedQuiz.title}</strong> → all students in this class
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
              }}
            >
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={!canAssign}
                style={{ minHeight: 48, fontSize: 16, fontWeight: 700 }}
              >
                {saving ? 'Assigning…' : '📋 Assign it to class so all may see it'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
