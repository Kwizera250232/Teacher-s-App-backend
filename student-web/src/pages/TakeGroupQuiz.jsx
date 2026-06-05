import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ClassDeanHelp from '../components/ClassDeanHelp';
import '../pages/Dashboard.css';

export default function TakeGroupQuiz() {
  const { classId, assignmentId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [className, setClassName] = useState('');

  const load = useCallback(async () => {
    try {
      const a = await api.get(`/classes/${classId}/group-quizzes/${assignmentId}`, token);
      setAssignment(a);
      setAnswers(a.draft_answers || {});
      if (a.status === 'submitted') {
        setResult({ score: a.score, total: a.total, submitted: true });
      }
      const qs = await api.get(`/classes/${classId}/quizzes/${a.quiz_id}/questions`, token);
      setQuestions(qs);
      api.get(`/classes/${classId}`, token).then((c) => setClassName(c?.name || '')).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [classId, assignmentId, token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const saveAnswers = async (nextAnswers) => {
    setSaving(true);
    try {
      await api.put(
        `/classes/${classId}/group-quizzes/${assignmentId}/answers`,
        { answers: nextAnswers },
        token
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAnswer = (questionId, value) => {
    if (assignment?.status === 'submitted') return;
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    saveAnswers({ [questionId]: value });
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      setError('Answer all questions before submitting for your group.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(
        `/classes/${classId}/group-quizzes/${assignmentId}/submit`,
        { answers },
        token
      );
      setResult(res);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !assignment) {
    return <div className="class-page"><main className="class-main"><p>Loading group quiz…</p></main></div>;
  }

  if (!assignment) {
    return <div className="class-page"><main className="class-main"><p className="alert alert-error">{error || 'Not found.'}</p></main></div>;
  }

  const canWork = assignment.status !== 'submitted';

  return (
    <div className="class-page wa-theme">
      <header className="dash-header wa-class-header">
        <button
          type="button"
          className="wa-back-btn"
          onClick={() => navigate(`/student/classes/${classId}?tab=Groups&group=${assignment.group_id}`)}
        >
          ←
        </button>
        <div className="wa-class-header-title">
          <strong>{assignment.group_name}</strong>
          <span>{assignment.quiz_title}</span>
        </div>
        <ClassDeanHelp
          token={token}
          classId={classId}
          className={className || assignment.group_name}
          buttonClassName="class-dean-help-btn--header"
          quizHint={assignment?.quiz_title ? `${assignment.quiz_title} (team ${assignment.group_name})` : ''}
        />
      </header>
      <main className="class-main">
        <div className="item-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>Group work</strong> — answers are shared with everyone in <strong>{assignment.group_name}</strong>.
            {saving && <span style={{ color: '#667eea', marginLeft: 8 }}>Saving…</span>}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
            Members: {assignment.members?.map((m) => m.name.split(' ')[0]).join(', ') || '—'}
          </p>
          {assignment.status === 'active' && assignment.started_by_name && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#059669' }}>
              Started by {assignment.started_by_name}
            </p>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {result && (
          <div className="score-card" style={{ marginBottom: 20 }}>
            <h2>Group submitted</h2>
            <div className="score-big">{result.score}/{result.total}</div>
            <p className="score-sub">Score recorded for all members of {assignment.group_name}</p>
          </div>
        )}

        {canWork && (assignment.status === 'active' || assignment.status === 'assigned') && questions.map((q, i) => (
          <div key={q.id} className="quiz-question">
            <h3>Q{i + 1}. {q.question}</h3>
            {q.question_type === 'fill_blank' ? (
              <input
                className="form-group"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '2px solid #e8e8e8' }}
                value={answers[q.id] || ''}
                onChange={(e) => handleAnswer(q.id, e.target.value)}
              />
            ) : (
              <div className="quiz-options">
                {['a', 'b', 'c', 'd'].map((opt) => {
                  const text = q[`option_${opt}`];
                  if (!text) return null;
                  return (
                    <label
                      key={opt}
                      className={`quiz-option ${answers[q.id] === opt ? 'selected' : ''}`}
                      onClick={() => handleAnswer(q.id, opt)}
                    >
                      <span className="quiz-option-text">{text}</span>
                      {answers[q.id] === opt && <span className="quiz-option-check">✓</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {canWork && assignment.status !== 'submitted' && questions.length > 0 && (
          <button
            type="button"
            className="btn btn-primary btn-full"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting for group…' : 'Submit for whole group'}
          </button>
        )}
      </main>
    </div>
  );
}
