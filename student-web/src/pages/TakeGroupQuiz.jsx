import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ClassDeanHelp from '../components/ClassDeanHelp';
import AchievementCelebrateModal from '../components/AchievementCelebrateModal';
import '../pages/Dashboard.css';

async function loadQuestions(classId, assignmentId, assignment, token) {
  if (assignment?.questions?.length) return assignment.questions;
  return api.get(`/classes/${classId}/group-quizzes/${assignmentId}/questions`, token);
}

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
  const [celebrateAchievements, setCelebrateAchievements] = useState(null);
  const questionsLoaded = useRef(false);

  const load = useCallback(async ({ refreshQuestions = false } = {}) => {
    try {
      let a = await api.get(`/classes/${classId}/group-quizzes/${assignmentId}`, token);
      if (a.status === 'assigned') {
        try {
          a = await api.post(`/classes/${classId}/group-quizzes/${assignmentId}/start`, {}, token);
        } catch {
          /* assignment row is still usable */
        }
      }
      setAssignment(a);
      setAnswers(a.draft_answers || {});
      if (a.status === 'submitted') {
        setResult({ score: a.score, total: a.total, submitted: true });
      }
      if (refreshQuestions || !questionsLoaded.current) {
        const qs = await loadQuestions(classId, assignmentId, a, token);
        setQuestions(qs);
        questionsLoaded.current = true;
      }
      setError('');
      api.get(`/classes/${classId}`, token).then((c) => setClassName(c?.name || '')).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [classId, assignmentId, token]);

  useEffect(() => {
    questionsLoaded.current = false;
    load({ refreshQuestions: true });
    const t = setInterval(() => load({ refreshQuestions: false }), 8000);
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
      const mine = res.newAchievements?.find((x) => x.student_id === user?.id);
      const earned = mine?.achievements?.filter((a) => a?.title_key) || [];
      if (earned.length) setCelebrateAchievements(earned);
      await load({ refreshQuestions: false });
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
      {celebrateAchievements && (
        <AchievementCelebrateModal
          classId={classId}
          groupId={assignment?.group_id}
          token={token}
          achievements={celebrateAchievements}
          score={result?.score}
          total={result?.total}
          onDone={() => {
            setCelebrateAchievements(null);
            navigate(`/student/classes/${classId}?tab=Groups&group=${assignment.group_id}`);
          }}
        />
      )}
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

        {error && !questions.length && <div className="alert alert-error">{error}</div>}

        {result && (
          <div className="score-card" style={{ marginBottom: 20 }}>
            <h2>Group submitted</h2>
            <div className="score-big">{result.score}/{result.total}</div>
            <p className="score-sub">Score recorded for all members of {assignment.group_name}</p>
          </div>
        )}

        {canWork && questions.map((q, i) => (
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

        {canWork && questions.length > 0 && (
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
