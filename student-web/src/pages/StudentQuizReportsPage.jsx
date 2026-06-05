import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import '../components/quizReflection/QuizReflectionForm.css';
import './Dashboard.css';

const GRADE_LABELS = {
  star5: '⭐⭐⭐⭐⭐ Outstanding',
  star4: '⭐⭐⭐⭐ Great',
  star3: '⭐⭐⭐ Good',
  growing: '🌱 Growing',
  support: '🤝 Needs support',
};

export default function StudentQuizReportsPage() {
  const { token } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');

  useEffect(() => {
    api.get('/student/quiz-reports', token)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!highlight || !reports.length) return;
    const el = document.getElementById(`report-${highlight}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight, reports]);

  return (
    <div className="class-page wa-theme">
      <header className="dash-header wa-class-header">
        <Link to="/student/dashboard" className="wa-back-btn">←</Link>
        <div className="wa-class-header-title">
          <strong>Quiz reports</strong>
          <span>Your reflections &amp; teacher comments</span>
        </div>
      </header>
      <main className="class-main">
        {loading && <p>Loading…</p>}
        {!loading && !reports.length && (
          <p style={{ color: '#64748b', textAlign: 'center', padding: 32 }}>
            No quiz reports yet. Finish a quiz and share your reflection with your teacher!
          </p>
        )}
        <div className="qr-report-list">
          {reports.map((r) => (
            <article
              key={r.id}
              id={`report-${r.id}`}
              className={`qr-report-card${r.unread_teacher_reply ? ' qr-report-card--unread' : ''}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 16 }}>{r.quiz_title}</strong>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : ''}
                </span>
              </div>
              <p style={{ margin: '6px 0', fontSize: 13, color: '#6366f1', fontWeight: 600 }}>
                📚 {r.subject}
                {r.group_name ? ` · 👥 ${r.group_name}` : ''}
                {r.score != null ? ` · ${r.score}/${r.total}` : ''}
              </p>
              {r.difficulty && (
                <p style={{ margin: '8px 0', fontSize: 14 }}><strong>Hard part:</strong> {r.difficulty}</p>
              )}
              {r.improvement && (
                <p style={{ margin: '8px 0', fontSize: 14 }}><strong>Grew in:</strong> {r.improvement}</p>
              )}
              {r.members?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 13 }}>Team notes</strong>
                  {r.members.map((m) => (
                    <div key={m.member_student_id} style={{ fontSize: 13, marginTop: 8, padding: 10, background: '#f8fafc', borderRadius: 10 }}>
                      <strong>{m.member_name}</strong>
                      {m.grade && <span> · {GRADE_LABELS[m.grade] || m.grade}</span>}
                      {m.showed_weakness && <span style={{ color: '#b45309' }}> · needs extra care</span>}
                      {m.help_needed && <p style={{ margin: '4px 0 0', color: '#475569' }}>{m.help_needed}</p>}
                    </div>
                  ))}
                </div>
              )}
              {r.teacher_comment && (
                <div className="qr-teacher-bubble" style={{ marginTop: 14 }}>
                  <strong style={{ color: '#059669' }}>{r.teacher_name || 'Teacher'}:</strong>
                  <p style={{ margin: '6px 0 0' }}>{r.teacher_comment}</p>
                </div>
              )}
              {!r.teacher_comment && (
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 10 }}>Waiting for teacher comment…</p>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
