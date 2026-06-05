import { useEffect, useState } from 'react';
import { api } from '../../api';
import './QuizReflectionForm.css';

const GRADE_LABELS = {
  star5: '⭐⭐⭐⭐⭐',
  star4: '⭐⭐⭐⭐',
  star3: '⭐⭐⭐',
  growing: '🌱',
  support: '🤝',
};

export default function TeacherQuizReportsPanel({ classId, token, highlightReportId }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyId, setReplyId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get(`/classes/${classId}/quiz-reports`, token)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [classId, token]);

  useEffect(() => {
    if (highlightReportId) setReplyId(Number(highlightReportId));
  }, [highlightReportId]);

  const sendReply = async (reportId) => {
    if (!replyText.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.put(
        `/classes/${classId}/quiz-reports/${reportId}/reply`,
        { teacher_comment: replyText },
        token
      );
      setReplyId(null);
      setReplyText('');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p style={{ color: '#64748b' }}>Loading quiz reports…</p>;

  if (!reports.length) {
    return (
      <p style={{ color: '#64748b', padding: '20px 0' }}>
        When students finish a quiz and send a team reflection, reports appear here for you to comment.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
        Student reflections after quizzes — reply with encouragement and next steps.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {reports.map((r) => (
        <div key={r.id} className="qr-teacher-panel-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>{r.quiz_title}</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ''}
            </span>
          </div>
          <p style={{ margin: '6px 0', fontSize: 13, color: '#6366f1' }}>
            📚 {r.subject}
            {r.group_name ? ` · 👥 ${r.group_name}` : ' · Solo'}
            {r.reporter_name ? ` · by ${r.reporter_name}` : ''}
            {r.score != null ? ` · ${r.score}/${r.total}` : ''}
          </p>

          {r.members?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#94a3b8' }}>Team member notes</strong>
              {r.members.map((m) => (
                <div key={m.member_student_id} style={{ fontSize: 13, marginTop: 8, padding: 10, background: m.showed_weakness ? '#fffbeb' : '#f8fafc', borderRadius: 10 }}>
                  <strong>{m.member_name}</strong>
                  {m.grade && ` ${GRADE_LABELS[m.grade] || m.grade}`}
                  {m.showed_weakness && <span style={{ color: '#b45309', fontWeight: 600 }}> · weakness noted</span>}
                  {m.help_needed && <p style={{ margin: '4px 0 0' }}>{m.help_needed}</p>}
                </div>
              ))}
            </div>
          )}

          {r.difficulty && <p style={{ fontSize: 14, marginTop: 10 }}><strong>Difficulty:</strong> {r.difficulty}</p>}
          {r.improvement && <p style={{ fontSize: 14 }}><strong>Improved:</strong> {r.improvement}</p>}
          {r.student_question && (
            <p style={{ fontSize: 14, background: '#eef2ff', padding: 10, borderRadius: 10, marginTop: 8 }}>
              <strong>Student question:</strong> {r.student_question}
            </p>
          )}

          {r.teacher_comment && replyId !== r.id && (
            <div className="qr-teacher-bubble" style={{ marginTop: 12 }}>
              <strong>Your reply:</strong>
              <p style={{ margin: '6px 0 0' }}>{r.teacher_comment}</p>
            </div>
          )}

          {replyId === r.id ? (
            <div className="qr-teacher-reply-box">
              <textarea
                className="qr-textarea"
                rows={3}
                placeholder="Write a short, encouraging comment focused on this student & team…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => sendReply(r.id)}>
                  {busy ? 'Sending…' : 'Send comment to student'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setReplyId(null); setReplyText(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => { setReplyId(r.id); setReplyText(r.teacher_comment || ''); }}
            >
              {r.teacher_comment ? 'Edit comment' : '💬 Add comment'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
