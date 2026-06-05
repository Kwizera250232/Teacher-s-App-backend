import { useState } from 'react';
import { api } from '../../api';
import { titleMeta } from '../../utils/achievementCatalog';
import './QuizReflectionForm.css';

export default function SoloQuizReflectionWizard({
  classId,
  quizId,
  token,
  subject,
  quizTitle,
  achievements = [],
  score,
  total,
  onComplete,
  onSkip,
}) {
  const [difficulty, setDifficulty] = useState('');
  const [improvement, setImprovement] = useState('');
  const [studentQuestion, setStudentQuestion] = useState('');
  const [crown, setCrown] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const unique = [];
  const seen = new Set();
  for (const a of achievements) {
    if (!a?.title_key || seen.has(a.title_key)) continue;
    seen.add(a.title_key);
    unique.push(a);
  }

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(
        `/classes/${classId}/quizzes/${quizId}/reflection`,
        {
          subject,
          difficulty,
          improvement,
          student_question: studentQuestion,
          crown_title_key: crown || undefined,
        },
        token
      );
      onComplete?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="qr-wizard-backdrop">
      <div className="qr-wizard">
        <div className="qr-hero">
          <div className="qr-hero-emoji">🌟</div>
          <h2>Reflect on your quiz</h2>
          <p>Tell your teacher what you learned — they care about your growth!</p>
          {score != null && (
            <span className="qr-score-pill">You scored {score}/{total} ({pct}%)</span>
          )}
        </div>
        <div className="qr-body">
          <div className="qr-subject-chip">
            📚 {subject} · <strong>{quizTitle}</strong>
          </div>
          {error && <div className="alert alert-error">{error}</div>}

          {unique.length > 0 && (
            <section className="qr-section">
              <h3 className="qr-section-title">👑 Wear your prize</h3>
              <div className="qr-crown-grid">
                {unique.map((a) => {
                  const meta = titleMeta(a.title_key) || a;
                  return (
                    <button
                      key={a.title_key}
                      type="button"
                      className={`qr-crown-btn${crown === a.title_key ? ' qr-crown-btn--active' : ''}`}
                      onClick={() => setCrown(a.title_key)}
                    >
                      <span style={{ fontSize: 22 }}>{meta.emoji || '🏆'}</span>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{meta.label}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="qr-section">
            <h3 className="qr-section-title">💡 Your reflection</h3>
            <textarea
              className="qr-textarea"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              placeholder="What was difficult?"
              rows={2}
            />
            <textarea
              className="qr-textarea"
              style={{ marginTop: 10 }}
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
              placeholder="What improved after the quiz?"
              rows={2}
            />
            <textarea
              className="qr-textarea"
              style={{ marginTop: 10 }}
              value={studentQuestion}
              onChange={(e) => setStudentQuestion(e.target.value)}
              placeholder="Question for your teacher"
              rows={2}
            />
          </section>

          <button type="button" className="qr-wear-btn" disabled={submitting} onClick={submit}>
            {submitting ? 'Sending…' : '✨ Send to teacher'}
          </button>
          <button type="button" className="qr-skip" onClick={() => onSkip?.()}>Skip</button>
        </div>
      </div>
    </div>
  );
}
