import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, uploadFile } from '../api';
import { InyandikoDocViewer, inyandikoFileUrl } from './inyandiko/InyandikoDocViewer';
import './InyandikoPanel.css';

function UploadBox({ label, hint, onUpload, uploading, accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt' }) {
  const inputRef = useRef(null);
  return (
    <div className="iny-upload-box">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="iny-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className="btn btn-secondary iny-upload-btn"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? 'Uploading…' : label}
      </button>
      {hint && <p className="iny-upload-hint">{hint}</p>}
    </div>
  );
}

function QuizMarksPanel({ marks }) {
  if (!marks?.length) {
    return <p className="iny-empty">No quizzes in this class yet.</p>;
  }
  const taken = marks.filter((m) => m.taken);
  if (!taken.length) {
    return <p className="iny-empty">You have not taken any quiz yet. Marks will appear here after you complete quizzes.</p>;
  }
  return (
    <div className="iny-quiz-table-wrap">
      <table className="iny-quiz-table">
        <thead>
          <tr>
            <th>Quiz</th>
            <th>Score</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {marks.map((m) => (
            <tr key={m.quiz_id} className={!m.taken ? 'iny-quiz-pending' : ''}>
              <td>{m.quiz_title}</td>
              <td>
                {m.taken ? `${m.score} / ${m.total}` : '—'}
              </td>
              <td>
                {m.taken ? (
                  <span className="iny-quiz-pct" data-pct={m.percentage}>
                    {m.percentage}%
                  </span>
                ) : (
                  'Not taken'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InyandikoPanel({ classId, isTeacher }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [commitment, setCommitment] = useState([]);
  const [schoolReports, setSchoolReports] = useState([]);
  const [quizMarks, setQuizMarks] = useState([]);
  const [teacherDocs, setTeacherDocs] = useState([]);

  const load = () => {
    if (!classId || !token) return;
    setLoading(true);
    setError('');
    const endpoint = isTeacher
      ? `/classes/${classId}/inyandiko/students`
      : `/classes/${classId}/inyandiko/mine`;
    api.get(endpoint, token)
      .then((data) => {
        if (isTeacher) {
          setTeacherDocs(Array.isArray(data) ? data : []);
        } else {
          setCommitment(data.commitment || []);
          setSchoolReports(data.school_reports || []);
          setQuizMarks(data.quiz_marks || []);
        }
      })
      .catch((err) => setError(err.message || 'Could not load Inyandiko data.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [classId, token, isTeacher]);

  const handleUpload = async (docType, file) => {
    if (!file || !token) return;
    setUploading(docType);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      fd.append('title', file.name);
      await uploadFile(`/classes/${classId}/inyandiko/documents`, fd, token);
      load();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading('');
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Remove this document?')) return;
    try {
      await api.delete(`/classes/${classId}/inyandiko/documents/${docId}`, token);
      load();
    } catch (err) {
      setError(err.message || 'Could not delete.');
    }
  };

  if (loading) return <div className="iny-loading">Gutegereza...</div>;

  if (isTeacher) {
    const byStudent = teacherDocs.reduce((acc, doc) => {
      const key = doc.student_id;
      if (!acc[key]) {
        acc[key] = { name: doc.student_name, commitment: [], school_reports: [] };
      }
      if (doc.doc_type === 'commitment') acc[key].commitment.push(doc);
      else acc[key].school_reports.push(doc);
      return acc;
    }, {});

    const students = Object.values(byStudent);

    return (
      <div className="iny-teacher-wrap">
        <p className="iny-intro">
          Student commitment letters and school reports uploaded in this class. Students manage these from their Leaderboard → Inyandiko tab.
        </p>
        {error && <p className="alert alert-error">{error}</p>}
        {students.length === 0 ? (
          <div className="iny-empty-state">
            <div className="iny-empty-icon">📄</div>
            <p>No student letters or reports uploaded yet.</p>
          </div>
        ) : (
          <div className="iny-teacher-list">
            {students.map((s) => (
              <div key={s.name} className="iny-teacher-card">
                <h4>{s.name}</h4>
                <div className="iny-teacher-grid">
                  <div>
                    <strong>Commitment</strong>
                    {s.commitment.length ? (
                      s.commitment.map((d) => (
                        <a key={d.id} href={inyandikoFileUrl(d.file_path)} target="_blank" rel="noreferrer" className="iny-teacher-link">
                          {d.title || d.file_name} ↗
                        </a>
                      ))
                    ) : (
                      <span className="iny-muted">—</span>
                    )}
                  </div>
                  <div>
                    <strong>School reports</strong>
                    {s.school_reports.length ? (
                      s.school_reports.map((d) => (
                        <a key={d.id} href={inyandikoFileUrl(d.file_path)} target="_blank" rel="noreferrer" className="iny-teacher-link">
                          {d.title || d.file_name} ↗
                        </a>
                      ))
                    ) : (
                      <span className="iny-muted">—</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const latestCommitment = commitment[0] || null;

  return (
    <div className="iny-student-wrap">
      <p className="iny-intro">
        Upload your commitment letter for your teacher and keep your school reports here. All quiz marks from this class are listed on the right.
      </p>
      {error && <p className="alert alert-error">{error}</p>}

      <div className="iny-student-grid">
        <section className="iny-panel">
          <h3 className="iny-panel-title">🤝 My commitment to achieve</h3>
          <p className="iny-panel-desc">Letter of agreement between you and your teacher in this class.</p>
          <UploadBox
            label="📤 Upload commitment letter"
            hint="PDF, Word, or photo of your signed letter"
            uploading={uploading === 'commitment'}
            onUpload={(file) => handleUpload('commitment', file)}
          />
          <InyandikoDocViewer doc={latestCommitment} />
          {latestCommitment && (
            <button type="button" className="iny-delete-btn" onClick={() => handleDelete(latestCommitment.id)}>
              Remove letter
            </button>
          )}
        </section>

        <section className="iny-panel">
          <h3 className="iny-panel-title">📋 My school reports</h3>
          <p className="iny-panel-desc">Term reports and official school documents.</p>
          <UploadBox
            label="📤 Add school report"
            hint="You can upload multiple reports (PDF or images)"
            uploading={uploading === 'school_report'}
            onUpload={(file) => handleUpload('school_report', file)}
          />
          {schoolReports.length === 0 ? (
            <p className="iny-empty">No school reports uploaded yet.</p>
          ) : (
            <ul className="iny-report-list">
              {schoolReports.map((doc) => (
                <li key={doc.id} className="iny-report-item">
                  <a href={inyandikoFileUrl(doc.file_path)} target="_blank" rel="noreferrer" className="iny-report-link">
                    {doc.title || doc.file_name}
                  </a>
                  <span className="iny-report-date">
                    {new Date(doc.uploaded_at).toLocaleDateString()}
                  </span>
                  <button type="button" className="iny-delete-btn" onClick={() => handleDelete(doc.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {schoolReports[0] && (
            <div className="iny-report-preview">
              <InyandikoDocViewer doc={schoolReports[0]} />
            </div>
          )}
        </section>

        <section className="iny-panel iny-panel--marks">
          <h3 className="iny-panel-title">📝 Quiz marks</h3>
          <p className="iny-panel-desc">Best score per quiz in this class.</p>
          <QuizMarksPanel marks={quizMarks} />
        </section>
      </div>
    </div>
  );
}
