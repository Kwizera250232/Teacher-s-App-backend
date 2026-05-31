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

  useEffect(() => {
    api.get(`/classes/${classId}/quizzes/${quizId}/results`, token)
      .then(setResults)
      .catch(e => setError(e.message));
  }, []);

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
        <h2 style={{ marginBottom: 24 }}>Quiz Results</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="students-table">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Student</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Date</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.student_name}</td>
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
          {results.length === 0 && <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>No attempts yet.</p>}
        </div>
      </main>
    </div>
  );
}
