import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { downloadWord } from '../utils/downloadResult';
import '../pages/Dashboard.css';

export default function QuizResults() {
  const { classId, quizId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get(`/classes/${classId}/quizzes/${quizId}/results`, token)
      .then(setResults)
      .catch(e => setError(e.message));
  }, []);

  const filtered = results.filter((r) => {
    if (filter === 'guests') return r.is_guest;
    if (filter === 'students') return !r.is_guest;
    return true;
  });

  const guestCount = results.filter((r) => r.is_guest).length;
  const studentCount = results.length - guestCount;

  async function handleDownload(attemptId, studentName) {
    setDownloading(attemptId);
    try {
      const data = await api.get(
        `/classes/${classId}/quizzes/${quizId}/attempts/${attemptId}/detail`,
        token
      );
      const safeName = studentName.replace(/[^a-z0-9]/gi, '_');
      downloadWord(`${data.quiz_title}_${safeName}`, data);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="class-page">
      <header className="dash-header">
        <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <div className="dash-brand">🎓 UClass</div>
      </header>
      <main className="class-main">
        <h2 style={{ marginBottom: 8 }}>Quiz Results</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Enrolled students ({studentCount}) · Share-link guests ({guestCount})
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All (${results.length})` },
            { id: 'students', label: `Students (${studentCount})` },
            { id: 'guests', label: `Guests (${guestCount})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        <div className="students-table">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Type</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Date</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.student_name}</td>
                  <td>
                    {r.is_guest ? (
                      <span className="badge badge-amber" style={{ fontSize: 11 }}>Guest</span>
                    ) : (
                      <span className="badge badge-green" style={{ fontSize: 11 }}>Student</span>
                    )}
                  </td>
                  <td><strong>{r.score}/{r.total}</strong></td>
                  <td>{Math.round((r.score / r.total) * 100)}%</td>
                  <td>{new Date(r.attempted_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleDownload(r.id, r.student_name)}
                      disabled={downloading === r.id}
                    >
                      {downloading === r.id ? 'Generating…' : '⬇ Word'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>No attempts yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
