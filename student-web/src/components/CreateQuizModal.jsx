import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const QTYPES = [
  { key: 'multiple_choice', label: 'Multiple Choice', emoji: '📝' },
  { key: 'true_false',      label: 'True / False',    emoji: '✅' },
  { key: 'fill_blank',      label: 'Fill in Blank',   emoji: '✏️' },
  { key: 'matching',        label: 'Matching',         emoji: '🔗' },
];

const EMPTY_QUESTION = {
  question_type: 'multiple_choice',
  question: '',
  option_a: '', option_b: '', option_c: '', option_d: '',
  correct_answer: 'a',
  passage: '',
  matching_pairs: [{ left: '', right: '' }, { left: '', right: '' }],
};

const DRAFT_KEY = (classId) => `quiz_draft_${classId}`;

function prepareForSave(q) {
  if (q.question_type === 'true_false') {
    return { ...q, option_a: 'True', option_b: 'False', option_c: '', option_d: '' };
  }
  if (q.question_type === 'fill_blank') {
    return { ...q, option_a: '', option_b: '', option_c: '', option_d: '' };
  }
  if (q.question_type === 'matching') {
    const pairs = (q.matching_pairs || []).filter(p => p.left.trim() && p.right.trim());
    return { ...q, passage: JSON.stringify(pairs), option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'match' };
  }
  return q;
}

export default function CreateQuizModal({ token, classId, onClose, onCreated, editQuiz }) {
  const isEdit = !!editQuiz;
  const draftKey = DRAFT_KEY(classId);
  const savedDraft = !isEdit ? (() => { try { return JSON.parse(localStorage.getItem(draftKey)); } catch { return null; } })() : null;

  const [title, setTitle] = useState(isEdit ? (editQuiz?.title || '') : (savedDraft?.title || ''));
  const [description, setDescription] = useState(isEdit ? (editQuiz?.description || '') : (savedDraft?.description || ''));
  const [questions, setQuestions] = useState(isEdit ? [{ ...EMPTY_QUESTION }] : (savedDraft?.questions || [{ ...EMPTY_QUESTION }]));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(isEdit);
  const [draftRestored, setDraftRestored] = useState(!isEdit && !!savedDraft);
  const isSubmitted = useRef(false);

  useEffect(() => {
    if (isEdit) return;
    localStorage.setItem(draftKey, JSON.stringify({ title, description, questions }));
  }, [title, description, questions]);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/classes/${classId}/quizzes/${editQuiz.id}/questions-edit`, token)
      .then(qs => {
        setQuestions(qs.map(q => ({
          question_type: q.question_type || 'multiple_choice',
          question: q.question,
          option_a: q.option_a || '',
          option_b: q.option_b || '',
          option_c: q.option_c || '',
          option_d: q.option_d || '',
          correct_answer: q.correct_answer,
          passage: q.question_type !== 'matching' ? (q.passage || '') : '',
          matching_pairs: q.question_type === 'matching'
            ? (() => { try { return JSON.parse(q.passage || '[]'); } catch { return [{ left: '', right: '' }, { left: '', right: '' }]; } })()
            : [{ left: '', right: '' }, { left: '', right: '' }],
        })));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingQuestions(false));
  }, []);

  useEffect(() => {
    return () => { if (!isEdit && isSubmitted.current) localStorage.removeItem(draftKey); };
  }, []);

  const addQuestion = () => setQuestions([...questions, { ...EMPTY_QUESTION }]);

  const updateQuestion = (i, field, value) => {
    const updated = [...questions];
    updated[i] = { ...updated[i], [field]: value };
    // Reset type-specific fields when type changes
    if (field === 'question_type') {
      if (value === 'true_false') {
        updated[i] = { ...updated[i], option_a: 'True', option_b: 'False', option_c: '', option_d: '', correct_answer: 'a' };
      } else if (value === 'fill_blank') {
        updated[i] = { ...updated[i], option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: '' };
      } else if (value === 'matching') {
        updated[i] = { ...updated[i], option_a: '', option_b: '', option_c: '', option_d: '',
          correct_answer: 'match', matching_pairs: [{ left: '', right: '' }, { left: '', right: '' }] };
      } else {
        updated[i] = { ...updated[i], option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'a' };
      }
    }
    setQuestions(updated);
  };

  const updateMatchingPair = (qi, pi, side, value) => {
    const updated = [...questions];
    const pairs = [...(updated[qi].matching_pairs || [])];
    pairs[pi] = { ...pairs[pi], [side]: value };
    updated[qi] = { ...updated[qi], matching_pairs: pairs };
    setQuestions(updated);
  };

  const addMatchingPair = (qi) => {
    const updated = [...questions];
    updated[qi] = { ...updated[qi], matching_pairs: [...(updated[qi].matching_pairs || []), { left: '', right: '' }] };
    setQuestions(updated);
  };

  const removeMatchingPair = (qi, pi) => {
    const updated = [...questions];
    const pairs = (updated[qi].matching_pairs || []).filter((_, i) => i !== pi);
    updated[qi] = { ...updated[qi], matching_pairs: pairs };
    setQuestions(updated);
  };

  const removeQuestion = (i) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    for (const q of questions) {
      if (!q.question.trim()) { setError('Every question needs question text.'); return; }
      if (q.question_type === 'matching') {
        const valid = (q.matching_pairs || []).filter(p => p.left.trim() && p.right.trim());
        if (valid.length < 2) { setError('Matching questions need at least 2 pairs.'); return; }
      } else if (q.question_type === 'fill_blank') {
        if (!q.correct_answer.trim()) { setError('Fill in Blank needs a correct answer.'); return; }
      } else if (q.question_type === 'multiple_choice') {
        if (!q.option_a.trim() || !q.option_b.trim()) { setError('Multiple choice needs at least Option A and B.'); return; }
      }
    }
    setLoading(true);
    try {
      const prepared = questions.map(prepareForSave);
      if (isEdit) {
        await api.put(`/classes/${classId}/quizzes/${editQuiz.id}`, { title, description, questions: prepared }, token);
      } else {
        await api.post(`/classes/${classId}/quizzes`, { title, description, questions: prepared }, token);
      }
      isSubmitted.current = true;
      if (!isEdit) localStorage.removeItem(draftKey);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Edit Quiz' : '❓ Create Quiz'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {draftRestored && (
          <div className="alert" style={{ background: '#fff7e6', border: '1px solid #ffd666', color: '#875800', borderRadius: 8, padding: '10px 14px', margin: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span>📝 Draft restored.</span>
            <button type="button" style={{ background: 'none', border: 'none', color: '#875800', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
              onClick={() => { setTitle(''); setDescription(''); setQuestions([{ ...EMPTY_QUESTION }]); localStorage.removeItem(draftKey); setDraftRestored(false); }}>
              Discard
            </button>
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        {loadingQuestions
          ? <p style={{ padding: 24, textAlign: 'center' }}>Loading questions...</p>
          : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Quiz Title *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 1 Quiz" required />
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 10 questions, 20 marks" />
            </div>

            <hr style={{ margin: '16px 0', borderColor: '#f0f0f0' }} />

            {questions.map((q, i) => (
              <div key={i} style={{ background: '#f8f9ff', borderRadius: 12, padding: '16px 18px', marginBottom: 14, border: '1.5px solid #e8edff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 14 }}>Question {i + 1}</strong>
                  {questions.length > 1 && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeQuestion(i)}>Remove</button>
                  )}
                </div>

                {/* Question Type Selector */}
                <div className="form-group">
                  <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>Question Type</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {QTYPES.map(t => (
                      <button key={t.key} type="button"
                        style={{
                          padding: '5px 12px', borderRadius: 20, border: '2px solid',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
                          borderColor: q.question_type === t.key ? '#2563eb' : '#e2e8f0',
                          background: q.question_type === t.key ? '#2563eb' : '#fff',
                          color: q.question_type === t.key ? '#fff' : '#475569',
                        }}
                        onClick={() => updateQuestion(i, 'question_type', t.key)}>
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Passage */}
                <div className="form-group">
                  <label style={{ fontSize: 12, color: '#64748b' }}>
                    📄 Reading Passage <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional — shown above the question)</span>
                  </label>
                  <textarea
                    value={q.question_type === 'matching' ? '' : (q.passage || '')}
                    onChange={e => updateQuestion(i, 'passage', e.target.value)}
                    placeholder="Paste a short passage if the question is based on a text..."
                    rows={2}
                    disabled={q.question_type === 'matching'}
                    style={{ fontSize: 13, background: q.question_type === 'matching' ? '#f8f8f8' : undefined }}
                  />
                </div>

                {/* Question Text */}
                <div className="form-group">
                  <label>Question Text *</label>
                  <input type="text" value={q.question}
                    onChange={e => updateQuestion(i, 'question', e.target.value)}
                    placeholder={
                      q.question_type === 'fill_blank' ? 'e.g. The capital of France is _____' :
                      q.question_type === 'matching' ? 'e.g. Match each word to its definition' :
                      q.question_type === 'true_false' ? 'e.g. The Earth is the third planet from the Sun.' :
                      'Enter your question'
                    }
                    required
                  />
                </div>

                {/* Type-specific fields */}
                {q.question_type === 'multiple_choice' && (
                  <>
                    {['a', 'b', 'c', 'd'].map(opt => (
                      <div className="form-group" key={opt}>
                        <label>Option {opt.toUpperCase()} {opt === 'a' || opt === 'b' ? '*' : '(optional)'}</label>
                        <input type="text" value={q[`option_${opt}`]}
                          onChange={e => updateQuestion(i, `option_${opt}`, e.target.value)}
                          placeholder={`Option ${opt.toUpperCase()}`}
                          required={opt === 'a' || opt === 'b'}
                        />
                      </div>
                    ))}
                    <div className="form-group">
                      <label>Correct Answer *</label>
                      <select value={q.correct_answer} onChange={e => updateQuestion(i, 'correct_answer', e.target.value)}>
                        <option value="a">A</option>
                        <option value="b">B</option>
                        {q.option_c && <option value="c">C</option>}
                        {q.option_d && <option value="d">D</option>}
                      </select>
                    </div>
                  </>
                )}

                {q.question_type === 'true_false' && (
                  <div className="form-group">
                    <label>Correct Answer *</label>
                    <select value={q.correct_answer} onChange={e => updateQuestion(i, 'correct_answer', e.target.value)}>
                      <option value="a">True</option>
                      <option value="b">False</option>
                    </select>
                    <small style={{ color: '#94a3b8', fontSize: 12 }}>Students will choose True or False</small>
                  </div>
                )}

                {q.question_type === 'fill_blank' && (
                  <div className="form-group">
                    <label>Correct Answer * <small style={{ color: '#94a3b8', fontWeight: 400 }}>(students must type this exactly)</small></label>
                    <input type="text" value={q.correct_answer}
                      onChange={e => updateQuestion(i, 'correct_answer', e.target.value)}
                      placeholder="e.g. Paris"
                      required
                    />
                    <small style={{ color: '#94a3b8', fontSize: 12 }}>Case-insensitive — "paris" = "Paris" = correct</small>
                  </div>
                )}

                {q.question_type === 'matching' && (
                  <div className="form-group">
                    <label>Matching Pairs * <small style={{ color: '#94a3b8', fontWeight: 400 }}>(left item → correct right item)</small></label>
                    {(q.matching_pairs || []).map((pair, pi) => (
                      <div key={pi} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <input
                          value={pair.left}
                          onChange={e => updateMatchingPair(i, pi, 'left', e.target.value)}
                          placeholder={`Left ${pi + 1} (e.g. Word)`}
                          style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13 }}
                        />
                        <span style={{ color: '#2563eb', fontWeight: 700, fontSize: 16 }}>→</span>
                        <input
                          value={pair.right}
                          onChange={e => updateMatchingPair(i, pi, 'right', e.target.value)}
                          placeholder={`Right ${pi + 1} (e.g. Definition)`}
                          style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13 }}
                        />
                        {(q.matching_pairs || []).length > 2 && (
                          <button type="button" onClick={() => removeMatchingPair(i, pi)}
                            style={{ background: 'none', border: 'none', color: '#e11d48', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
                        )}
                      </div>
                    ))}
                    {(q.matching_pairs || []).length < 6 && (
                      <button type="button" onClick={() => addMatchingPair(i)}
                        style={{ fontSize: 13, color: '#2563eb', background: 'none', border: '1.5px dashed #bfdbfe', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', marginTop: 2 }}>
                        + Add Pair
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <button type="button" className="btn btn-secondary btn-full" onClick={addQuestion} style={{ marginBottom: 16 }}>
              + Add Question
            </button>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading
                  ? (isEdit ? 'Saving...' : 'Creating...')
                  : isEdit
                    ? `Save Changes (${questions.length} questions)`
                    : `Create Quiz (${questions.length} questions)`
                }
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
