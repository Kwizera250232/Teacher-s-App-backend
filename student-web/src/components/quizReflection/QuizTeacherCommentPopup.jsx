import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './QuizReflectionForm.css';

export default function QuizTeacherCommentPopup({ token }) {
  const [report, setReport] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    api.get('/student/quiz-reports/popup', token)
      .then((r) => setReport(r || null))
      .catch(() => setReport(null));
  }, [token]);

  if (!report?.teacher_comment) return null;

  const dismiss = async () => {
    try {
      await api.put(`/student/quiz-reports/${report.id}/read`, {}, token);
    } catch {
      /* ignore */
    }
    setReport(null);
  };

  const openHistory = async () => {
    await dismiss();
    navigate(`/student/quiz-reports?highlight=${report.id}`);
  };

  return (
    <div className="qr-popup-backdrop">
      <div className="qr-teacher-popup">
        <div style={{ fontSize: 40 }}>💬✨</div>
        <h3>{report.teacher_name || 'Your teacher'} replied!</h3>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
          About <strong>{report.quiz_title}</strong>
          {report.subject ? ` · ${report.subject}` : ''}
        </p>
        <div className="qr-teacher-bubble">{report.teacher_comment}</div>
        <button type="button" className="qr-wear-btn" onClick={openHistory}>
          Open quiz report
        </button>
        <button type="button" className="qr-skip" onClick={dismiss}>
          Got it — move to history
        </button>
      </div>
    </div>
  );
}
