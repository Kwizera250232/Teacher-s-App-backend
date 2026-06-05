import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function GuestMarksPanel({ token, classId, compact = false }) {
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const path = classId ? `/classes/${classId}/guest-marks` : '/classes/guest-marks';
    api
      .get(path, token)
      .then((rows) => setMarks(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        const msg = String(e.message || '');
        if (/404/.test(msg) || /not found/i.test(msg) || /not on the server yet/i.test(msg)) {
          setMarks([]);
        } else {
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, [token, classId]);

  if (loading) return <p className="phub-muted">Loading guest marks…</p>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!marks.length) {
    return (
      <p className="phub-muted" style={{ fontSize: 13 }}>
        No guest quiz attempts yet. Share a quiz link — guests who sign up and take quizzes appear here with
        their scores (not on the class leaderboard).
      </p>
    );
  }

  return (
    <div className="guest-marks-panel">
      {!compact && (
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
          Scores from people who joined via your <strong>shared quiz links</strong> (@guest.umunsi.com). These
          attempts are separate from enrolled students.
        </p>
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Quiz</th>
              <th>Class</th>
              <th>Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {marks.map((m) => (
              <tr key={m.attempt_id}>
                <td>
                  <strong>{m.guest_name}</strong>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{m.guest_email}</div>
                </td>
                <td>{m.quiz_title}</td>
                <td>{m.class_name}</td>
                <td>
                  <strong>
                    {m.score}/{m.total}
                  </strong>{' '}
                  ({m.total ? Math.round((m.score / m.total) * 100) : 0}%)
                </td>
                <td>{new Date(m.attempted_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GuestMarksPanelLink({ classId, basePath = '/teacher' }) {
  if (classId) {
    return (
      <Link to={`${basePath}/classes/${classId}?tab=Quizzes`} className="btn btn-secondary btn-sm">
        👤 Guest marks
      </Link>
    );
  }
  return null;
}
