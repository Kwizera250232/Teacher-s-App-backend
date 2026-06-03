import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { downloadWord } from '../utils/downloadResult';
import '../pages/Dashboard.css';

export default function TakeQuiz() {
  const { classId, quizId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const goBack = () => {
    if (user?.role === 'guest') navigate('/guest/dashboard');
    else navigate(-1);
  };
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [prevResult, setPrevResult] = useState(null); // full my-result data
  const [showReview, setShowReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/classes/${classId}/quizzes/${quizId}/questions`, token),
      api.get(`/classes/${classId}/quizzes/${quizId}/my-result`, token).catch(() => null),
    ]).then(([qs, existing]) => {
      setQuestions(qs);
      if (existing && existing.score !== undefined) {
        setAlreadyDone(true);
        setPrevResult(existing);
        setResult({ score: existing.score, total: existing.total, results: {} });
      }
    }).catch(e => setError(e.message));
  }, []);

  const handleAnswer = (questionId, option) => {
    if (submitted) return;
    setAnswers({ ...answers, [questionId]: option });
  };

  const handleTextAnswer = (questionId, value) => {
    if (submitted) return;
    setAnswers({ ...answers, [questionId]: value });
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      setError('Please answer all questions before submitting.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post(`/classes/${classId}/quizzes/${quizId}/submit`, { answers }, token);
      if (res.offline) {
        setError('');
        setResult({ score: '?', total: questions.length, results: {}, offline: true });
        setSubmitted(true);
      } else {
        setResult(res);
        setSubmitted(true);
        setError('');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const data = await api.get(`/classes/${classId}/quizzes/${quizId}/my-result`, token);
      const safeName = data.student_name.replace(/[^a-z0-9]/gi, '_');
      downloadWord(`${data.quiz_title}_${safeName}`, data);
    } catch (e) { setError(e.message); }
    finally { setDownloading(false); }
  };

  // ── ALREADY SUBMITTED SCREEN ─────────────────────────────────────────────
  if (alreadyDone && prevResult) {
    const pct = Math.round((prevResult.score / prevResult.total) * 100);
    const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '🎉' : pct >= 40 ? '👍' : '📚';
    const msg = pct >= 80 ? 'Superbe!' : pct >= 60 ? 'Wabigenje neza!' : pct >= 40 ? 'Gerageza cyane!' : 'Komeza wihatire!';

    return (
      <div className="class-page">
        <header className="dash-header">
          <button className="btn btn-outline btn-sm" onClick={goBack}>← Back</button>
          <div className="dash-brand">🎓 UClass</div>
        </header>
        <main className="class-main" style={{ maxWidth: 680 }}>

          {/* Result card */}
          <div style={{
            background: 'white', borderRadius: 16, padding: '32px 28px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', marginBottom: 24,
          }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>{emoji}</div>
            <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>{prevResult.quiz_title}</h2>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
              {prevResult.class_name} · {prevResult.teacher_name}
            </p>

            {/* Big score */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: pct >= 70 ? '#f0fff4' : pct >= 50 ? '#fffbeb' : '#fff0f0',
              border: `3px solid ${pct >= 70 ? '#27ae60' : pct >= 50 ? '#f59e0b' : '#e74c3c'}`,
              borderRadius: 20, padding: '18px 40px', marginBottom: 16,
            }}>
              <span style={{ fontSize: 42, fontWeight: 900, color: '#222' }}>{prevResult.score}</span>
              <span style={{ fontSize: 22, color: '#888', margin: '0 6px' }}>/</span>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#555' }}>{prevResult.total}</span>
            </div>

            <div style={{ fontSize: 22, fontWeight: 700, color: pct >= 70 ? '#27ae60' : pct >= 50 ? '#f59e0b' : '#e74c3c', marginBottom: 6 }}>
              {pct}%
            </div>
            <div style={{ fontSize: 15, color: '#666', marginBottom: 24 }}>{msg}</div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
              <button
                className="btn btn-primary"
                style={{ flex: '1 1 160px', minWidth: 0, justifyContent: 'center' }}
                disabled={downloading}
                onClick={handleDownload}
              >
                {downloading ? '⏳ Gutegereza...' : "⬇ Kora Download y'amanota yanjye"}
              </button>
              <button
                className="btn btn-outline"
                style={{ flex: '1 1 160px', minWidth: 0, justifyContent: 'center' }}
                onClick={() => setShowReview(r => !r)}
              >
                {showReview ? '▲ Hisha Ibisubizo' : '📋 Reba Ibisubizo Byanjye'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: '1 1 140px', minWidth: 0, justifyContent: 'center' }}
                onClick={goBack}
              >
                ← Subira mu Ishuri
              </button>
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {/* Inline review */}
          {showReview && prevResult.detailed && (
            <div>
              <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700 }}>
                📋 Ibisubizo Byanjye ({prevResult.score}/{prevResult.total})
              </h3>
              {prevResult.detailed.map((q, i) => {
                const qtype = q.question_type || 'multiple_choice';
                return (
                <div key={i} style={{
                  background: 'white', borderRadius: 12, padding: '16px 18px',
                  marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                  borderLeft: `4px solid ${q.is_correct ? '#27ae60' : '#e74c3c'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong style={{ fontSize: 14 }}>Q{q.number}: {q.question}</strong>
                    <span style={{ fontSize: 18 }}>{q.is_correct ? '✅' : '❌'}</span>
                  </div>
                  {/* MC / True-False options */}
                  {(qtype === 'multiple_choice' || qtype === 'true_false') && ['a', 'b', 'c', 'd'].map(opt => {
                    const text = q[`option_${opt}`];
                    if (!text) return null;
                    const isCorrect = q.correct_answer === opt;
                    const isGiven = q.student_answer === opt;
                    let bg = 'transparent', border = '#eee';
                    if (isCorrect) { bg = '#f0fff4'; border = '#27ae60'; }
                    else if (isGiven && !isCorrect) { bg = '#fff0f0'; border = '#e74c3c'; }
                    return (
                      <div key={opt} style={{ padding: '7px 12px', borderRadius: 7, background: bg, border: `1px solid ${border}`, marginBottom: 4, fontSize: 13 }}>
                        <strong>{opt.toUpperCase()}.</strong> {text}
                        {isCorrect && <span style={{ float: 'right', color: '#27ae60', fontWeight: 700 }}>✓ Correct</span>}
                        {isGiven && !isCorrect && <span style={{ float: 'right', color: '#e74c3c', fontWeight: 700 }}>✗ Your answer</span>}
                      </div>
                    );
                  })}
                  {/* Fill in Blank */}
                  {qtype === 'fill_blank' && (
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      <div style={{ padding: '7px 12px', borderRadius: 7, background: q.is_correct ? '#f0fff4' : '#fff0f0', border: `1px solid ${q.is_correct ? '#27ae60' : '#e74c3c'}`, marginBottom: 4 }}>
                        Your answer: <strong>{q.student_answer}</strong>
                      </div>
                      {!q.is_correct && (
                        <div style={{ padding: '7px 12px', borderRadius: 7, background: '#f0fff4', border: '1px solid #27ae60' }}>
                          Correct answer: <strong>{q.correct_answer}</strong>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Matching */}
                  {qtype === 'matching' && (() => {
                    let pairs = []; try { pairs = JSON.parse(q.passage || '[]'); } catch {}
                    const studentParts = (q.student_answer || '').split('|');
                    return (
                      <div style={{ fontSize: 13, marginTop: 6 }}>
                        {pairs.map((pair, pi) => {
                          const given = (studentParts[pi] || '').trim();
                          const correct = pair.right.trim();
                          const ok = given.toLowerCase() === correct.toLowerCase();
                          return (
                            <div key={pi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ flex: 1, padding: '6px 10px', background: '#f1f5f9', borderRadius: 6, fontWeight: 600 }}>{pair.left}</span>
                              <span style={{ color: ok ? '#27ae60' : '#e74c3c', fontWeight: 700, fontSize: 16 }}>{ok ? '✓' : '✗'}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ padding: '6px 10px', borderRadius: 6, background: ok ? '#f0fff4' : '#fff0f0', border: `1px solid ${ok ? '#27ae60' : '#e74c3c'}` }}>Your: <strong>{given || '—'}</strong></div>
                                {!ok && <div style={{ padding: '6px 10px', borderRadius: 6, background: '#f0fff4', border: '1px solid #27ae60', marginTop: 3 }}>Correct: <strong>{correct}</strong></div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (submitted && result) {
    if (result.offline) {
      return (
        <div className="class-page">
          <header className="dash-header">
            <button className="btn btn-outline btn-sm" onClick={goBack}>← Back</button>
            <div className="dash-brand">🎓 UClass</div>
          </header>
          <main className="class-main" style={{ maxWidth: 600 }}>
            <div className="score-card">
              <div style={{ fontSize: 48 }}>📡</div>
              <h2>Quiz Saved Offline!</h2>
              <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.6, marginTop: 12 }}>
                Your answers have been saved on your device. They will be submitted automatically when you reconnect to the internet.
              </p>
              <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={goBack}>
                ← Back to Class
              </button>
            </div>
          </main>
        </div>
      );
    }
    const percentage = Math.round((result.score / result.total) * 100);
    return (
      <div className="class-page">
        <header className="dash-header">
          <button className="btn btn-outline btn-sm" onClick={goBack}>← Back</button>
          <div className="dash-brand">🎓 UClass</div>
        </header>
        <main className="class-main" style={{ maxWidth: 600 }}>
          <div className="score-card">
            <div style={{ fontSize: 48 }}>{percentage >= 70 ? '🎉' : percentage >= 50 ? '👍' : '📚'}</div>
            <h2>Quiz Complete!</h2>
            <div className="score-big">{result.score}/{result.total}</div>
            <div className="score-sub">{percentage}% — {percentage >= 70 ? 'Great job!' : percentage >= 50 ? 'Good effort!' : 'Keep studying!'}</div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Review Answers</h3>
            {questions.map((q, i) => {
              const qResult = result.results[q.id];
              const qtype = q.question_type || 'multiple_choice';
              return (
                <div key={q.id} style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <strong style={{ fontSize: 14 }}>Q{i + 1}: {q.question}</strong>
                    <span>{qResult?.is_correct ? '✅' : '❌'}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    {/* MC / True-False */}
                    {(qtype === 'multiple_choice' || qtype === 'true_false') && ['a', 'b', 'c', 'd'].map(opt => {
                      if (!q[`option_${opt}`]) return null;
                      const isCorrect = qResult?.correct === opt;
                      const isGiven = qResult?.given === opt;
                      let bg = 'transparent';
                      if (isCorrect) bg = '#f0fff4';
                      else if (isGiven && !isCorrect) bg = '#fff0f0';
                      return (
                        <div key={opt} style={{ padding: '6px 10px', borderRadius: 6, background: bg, marginBottom: 4, border: `1px solid ${isCorrect ? '#27ae60' : isGiven ? '#e74c3c' : '#eee'}` }}>
                          <strong>{opt.toUpperCase()}.</strong> {q[`option_${opt}`]}
                          {isCorrect && ' ✅'}
                          {isGiven && !isCorrect && ' ❌'}
                        </div>
                      );
                    })}
                    {/* Fill in blank */}
                    {qtype === 'fill_blank' && (
                      <>
                        <div style={{ padding: '6px 10px', borderRadius: 6, marginBottom: 4, background: qResult?.is_correct ? '#f0fff4' : '#fff0f0', border: `1px solid ${qResult?.is_correct ? '#27ae60' : '#e74c3c'}` }}>
                          Your answer: <strong>{qResult?.given || '—'}</strong> {qResult?.is_correct ? '✅' : '❌'}
                        </div>
                        {!qResult?.is_correct && <div style={{ padding: '6px 10px', borderRadius: 6, background: '#f0fff4', border: '1px solid #27ae60' }}>Correct: <strong>{qResult?.correct}</strong></div>}
                      </>
                    )}
                    {/* Matching */}
                    {qtype === 'matching' && (() => {
                      let pairs = []; try { pairs = JSON.parse(q.passage || '[]'); } catch {}
                      const studentParts = (qResult?.given || '').split('|');
                      return pairs.map((pair, pi) => {
                        const given = (studentParts[pi] || '').trim();
                        const ok = given.toLowerCase() === pair.right.trim().toLowerCase();
                        return (
                          <div key={pi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ flex: 1, padding: '5px 9px', background: '#f1f5f9', borderRadius: 5, fontWeight: 600 }}>{pair.left}</span>
                            <span style={{ color: ok ? '#27ae60' : '#e74c3c', fontWeight: 700 }}>{ok ? '✓' : '✗'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ padding: '5px 9px', borderRadius: 5, background: ok ? '#f0fff4' : '#fff0f0', border: `1px solid ${ok ? '#27ae60' : '#e74c3c'}` }}>You: <strong>{given || '—'}</strong></div>
                              {!ok && <div style={{ padding: '5px 9px', borderRadius: 5, background: '#f0fff4', border: '1px solid #27ae60', marginTop: 3 }}>Correct: <strong>{pair.right}</strong></div>}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1 }}
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  const data = await api.get(`/classes/${classId}/quizzes/${quizId}/my-result`, token);
                  const safeName = data.student_name.replace(/[^a-z0-9]/gi, '_');
                  downloadWord(`${data.quiz_title}_${safeName}`, data);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setDownloading(false);
                }
              }}
            >
              {downloading ? 'Generating…' : '⬇ Download My Result'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={goBack}>
              Back to Class
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="class-page">
      <header className="dash-header">
        <button className="btn btn-outline btn-sm" onClick={goBack}>← Back</button>
        <div className="dash-brand">🎓 UClass</div>
      </header>
      <main className="class-main" style={{ maxWidth: 700 }}>

        {!alreadyDone && (
          <>
            <h2 style={{ marginBottom: 8 }}>Quiz</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>{questions.length} questions · Answer all before submitting</p>

            {error && <div className="alert alert-error">{error}</div>}

            {questions.map((q, i) => {
              const qtype = q.question_type || 'multiple_choice';
              let matchingPairs = [];
              if (qtype === 'matching') {
                try { matchingPairs = JSON.parse(q.passage || '[]'); } catch {}
              }
              const currentAnswer = answers[q.id] || '';
              const matchingAnswers = qtype === 'matching' ? currentAnswer.split('|') : [];

              return (
              <div key={q.id} className="quiz-question">
                {q.passage && qtype !== 'matching' && (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 14, color: '#1e293b', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    <strong style={{ fontSize: 12, color: '#0369a1', display: 'block', marginBottom: 6 }}>📄 Reading Passage</strong>
                    {q.passage}
                  </div>
                )}
                <h3>Q{i + 1}: {q.question}</h3>

                {/* Multiple choice */}
                {qtype === 'multiple_choice' && (
                  <div className="quiz-options">
                    {['a', 'b', 'c', 'd'].map(opt => {
                      if (!q[`option_${opt}`]) return null;
                      return (
                        <label key={opt} className={`quiz-option ${currentAnswer === opt ? 'selected' : ''}`} onClick={() => handleAnswer(q.id, opt)}>
                          <span className="quiz-option-text">
                            <strong>{opt.toUpperCase()}.</strong> {q[`option_${opt}`]}
                          </span>
                          {currentAnswer === opt && (
                            <span className="quiz-option-check" aria-label="Selected">V</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* True / False */}
                {qtype === 'true_false' && (
                  <div className="quiz-options">
                    {[{ val: 'a', label: '✓ True' }, { val: 'b', label: '✗ False' }].map(({ val, label }) => (
                      <label key={val} className={`quiz-option ${currentAnswer === val ? 'selected' : ''}`} onClick={() => handleAnswer(q.id, val)}
                        style={{ fontSize: 15, fontWeight: 600 }}>
                        <span className="quiz-option-text">{label}</span>
                        {currentAnswer === val && (
                          <span className="quiz-option-check" aria-label="Selected">V</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}

                {/* Fill in blank */}
                {qtype === 'fill_blank' && (
                  <div style={{ marginTop: 12 }}>
                    <input
                      type="text"
                      value={currentAnswer}
                      onChange={e => handleTextAnswer(q.id, e.target.value)}
                      placeholder="Type your answer here…"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', border: `2px solid ${currentAnswer.trim() ? '#128c7e' : '#e2e8f0'}`, borderRadius: 9, fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
                    />
                    {currentAnswer.trim() && (
                      <p className="quiz-answer-saved">
                        <span className="quiz-option-check" aria-hidden>V</span>
                        Igisubizo cyawe cyabitswe
                      </p>
                    )}
                    <small style={{ color: '#94a3b8', fontSize: 12, marginTop: 4, display: 'block' }}>Type your answer exactly (not case-sensitive)</small>
                  </div>
                )}

                {/* Matching */}
                {qtype === 'matching' && matchingPairs.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>Match each item on the left to the correct item on the right. Type the matching right-side answer for each.</p>
                    {matchingPairs.map((pair, pi) => {
                      const currentVal = matchingAnswers[pi] || '';
                      return (
                        <div key={pi} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ flex: 1, padding: '9px 14px', background: '#f1f5f9', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
                            {pair.left}
                          </div>
                          <span style={{ color: '#2563eb', fontWeight: 700, fontSize: 18 }}>→</span>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="text"
                              value={currentVal}
                              onChange={e => {
                                const parts = (answers[q.id] || '').split('|');
                                while (parts.length <= pi) parts.push('');
                                parts[pi] = e.target.value;
                                handleTextAnswer(q.id, parts.join('|'));
                              }}
                              placeholder={`Match for "${pair.left}"…`}
                              style={{ flex: 1, padding: '9px 14px', border: `2px solid ${currentVal.trim() ? '#128c7e' : '#e2e8f0'}`, borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                            />
                            {currentVal.trim() && (
                              <span className="quiz-option-check" aria-label="Answer saved">V</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}

            {questions.length > 0 && (
              <button
                className="btn btn-primary btn-full"
                onClick={handleSubmit}
                disabled={loading || Object.keys(answers).length < questions.length}
                style={{ marginTop: 8 }}
              >
                {loading ? 'Submitting...' : `Submit Quiz (${Object.keys(answers).length}/${questions.length} answered)`}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
