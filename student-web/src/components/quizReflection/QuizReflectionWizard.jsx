import { useEffect, useState } from 'react';
import { api } from '../../api';
import { titleMeta } from '../../utils/achievementCatalog';
import './QuizReflectionForm.css';

const GRADES = [
  { key: 'star5', label: '⭐⭐⭐⭐⭐', text: 'Outstanding' },
  { key: 'star4', label: '⭐⭐⭐⭐', text: 'Great' },
  { key: 'star3', label: '⭐⭐⭐', text: 'Good' },
  { key: 'growing', label: '🌱', text: 'Growing' },
  { key: 'support', label: '🤝', text: 'Needs support' },
];

function emptyMemberNotes(members) {
  return members.map((m) => ({
    member_student_id: m.id,
    member_name: m.name,
    grade: '',
    showed_weakness: false,
    help_needed: '',
    leader_comment: '',
  }));
}

/**
 * Post–group-quiz reflection: teammate grades, help notes, crown wear, send to teacher.
 */
export default function QuizReflectionWizard({
  classId,
  assignmentId,
  token,
  achievements = [],
  score,
  total,
  onComplete,
  onSkip,
}) {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [improvement, setImprovement] = useState('');
  const [studentQuestion, setStudentQuestion] = useState('');
  const [crown, setCrown] = useState('');
  const [memberNotes, setMemberNotes] = useState([]);

  const uniqueAchievements = [];
  const seen = new Set();
  for (const a of achievements) {
    const key = a?.title_key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueAchievements.push(a);
  }

  useEffect(() => {
    api
      .get(`/classes/${classId}/group-quizzes/${assignmentId}/reflection`, token)
      .then((t) => {
        setTemplate(t);
        if (t.existing_report) {
          onComplete?.(t.existing_report);
          return;
        }
        setMemberNotes(emptyMemberNotes(t.members || []));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [classId, assignmentId, token]);

  const updateMember = (id, patch) => {
    setMemberNotes((prev) =>
      prev.map((n) => (n.member_student_id === id ? { ...n, ...patch } : n))
    );
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(
        `/classes/${classId}/group-quizzes/${assignmentId}/reflection`,
        {
          subject: template?.subject,
          difficulty,
          improvement,
          student_question: studentQuestion,
          crown_title_key: crown || undefined,
          member_notes: memberNotes,
        },
        token
      );
      onComplete?.(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="qr-wizard-backdrop">
        <div className="qr-wizard" style={{ padding: 40, textAlign: 'center' }}>Loading…</div>
      </div>
    );
  }

  if (!template) {
    return null;
  }

  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="qr-wizard-backdrop">
      <div className="qr-wizard">
        <div className="qr-hero">
          <div className="qr-hero-emoji">🎓✨</div>
          <h2>How did your team shine?</h2>
          <p>
            Share grades &amp; kind notes for <strong>{template.group_name}</strong> — your teacher will see how to help everyone grow.
          </p>
          {(score != null) && (
            <span className="qr-score-pill">Team score {score}/{total} ({pct}%)</span>
          )}
        </div>

        <div className="qr-body">
          <div className="qr-subject-chip">
            📚 Subject: <strong>{template.subject}</strong>
            <span style={{ opacity: 0.7 }}>· {template.quiz_title}</span>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {uniqueAchievements.length > 0 && (
            <section className="qr-section">
              <h3 className="qr-section-title">👑 Wear your prize</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>
                Pick a crown to wear on your profile — then send your team report.
              </p>
              <div className="qr-crown-grid">
                {uniqueAchievements.map((a) => {
                  const meta = titleMeta(a.title_key) || a;
                  const active = crown === a.title_key;
                  return (
                    <button
                      key={a.title_key}
                      type="button"
                      className={`qr-crown-btn${active ? ' qr-crown-btn--active' : ''}`}
                      onClick={() => setCrown(a.title_key)}
                    >
                      <span style={{ fontSize: 22 }}>{meta.emoji || '🏆'}</span>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{meta.label || a.title_key}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="qr-section">
            <h3 className="qr-section-title">👥 Team members</h3>
            {template.is_leader && (
              <p style={{ fontSize: 13, color: '#7c3aed', margin: '0 0 12px', fontWeight: 600 }}>
                You are the group leader — your notes help the teacher support each teammate.
              </p>
            )}
            {memberNotes.map((n) => (
              <div
                key={n.member_student_id}
                className={`qr-member-card${n.showed_weakness ? ' qr-member-card--weak' : ''}`}
              >
                <div className="qr-member-head">
                  <span className="qr-member-name">{n.member_name}</span>
                  {template.members?.find((m) => m.id === n.member_student_id)?.is_leader && (
                    <span className="qr-member-leader">👑 Leader</span>
                  )}
                </div>
                <div className="qr-grade-row">
                  {GRADES.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      className={`qr-grade-btn${n.grade === g.key ? ' qr-grade-btn--active' : ''}`}
                      onClick={() => updateMember(n.member_student_id, { grade: g.key })}
                      title={g.text}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <label className="qr-weak-toggle">
                  <input
                    type="checkbox"
                    checked={n.showed_weakness}
                    onChange={(e) =>
                      updateMember(n.member_student_id, { showed_weakness: e.target.checked })
                    }
                  />
                  Showed weakness while we worked together
                </label>
                <textarea
                  className="qr-textarea"
                  placeholder="How can they be helped? e.g. Still needs help with Tenses…"
                  value={n.help_needed}
                  onChange={(e) =>
                    updateMember(n.member_student_id, { help_needed: e.target.value })
                  }
                  rows={2}
                />
              </div>
            ))}
          </section>

          <section className="qr-section">
            <h3 className="qr-section-title">💡 About this lesson</h3>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>What was difficult?</label>
            <textarea
              className="qr-textarea"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              placeholder="e.g. Past tense questions were tricky…"
              rows={2}
            />
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginTop: 10, display: 'block' }}>
              What improved after doing the quiz?
            </label>
            <textarea
              className="qr-textarea"
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
              placeholder="e.g. We understand timelines better now…"
              rows={2}
            />
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginTop: 10, display: 'block' }}>
              Question for your teacher
            </label>
            <textarea
              className="qr-textarea"
              value={studentQuestion}
              onChange={(e) => setStudentQuestion(e.target.value)}
              placeholder="Ask anything about this lesson…"
              rows={2}
            />
          </section>

          <button
            type="button"
            className="qr-wear-btn"
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? 'Sending…' : uniqueAchievements.length ? '👑 Wear & send to teacher' : '✨ Send report to teacher'}
          </button>
          <button type="button" className="qr-skip" onClick={() => onSkip?.()}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
