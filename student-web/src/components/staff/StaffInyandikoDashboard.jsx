import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { InyandikoDocViewer, inyandikoFileUrl } from '../inyandiko/InyandikoDocViewer';
import '../InyandikoPanel.css';
import './StaffInyandikoDashboard.css';

export default function StaffInyandikoDashboard({ token, basePath }) {
  const [data, setData] = useState({ classes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedKey, setExpandedKey] = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    api
      .get('/classes/inyandiko/dashboard', token)
      .then((res) => setData({ classes: res.classes || [] }))
      .catch((err) => setError(err.message || 'Could not load Inyandiko.'))
      .finally(() => setLoading(false));
  }, [token]);

  const filteredClasses = useMemo(() => {
    const list = classFilter === 'all'
      ? data.classes
      : data.classes.filter((c) => String(c.id) === classFilter);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list
      .map((cls) => ({
        ...cls,
        students: (cls.students || []).filter((s) => s.student_name?.toLowerCase().includes(q)),
      }))
      .filter((cls) => cls.students.length > 0);
  }, [data.classes, classFilter, search]);

  const stats = useMemo(() => {
    let students = 0;
    let withCommitment = 0;
    let withReports = 0;
    for (const cls of data.classes) {
      for (const s of cls.students || []) {
        students += 1;
        if (s.commitment) withCommitment += 1;
        if (s.school_reports?.length) withReports += 1;
      }
    }
    return { students, withCommitment, withReports };
  }, [data.classes]);

  if (loading) return <p className="phub-muted">Loading student Inyandiko…</p>;
  if (error) return <div className="alert alert-error">{error}</div>;

  if (!data.classes.length) {
    return (
      <div className="iny-dash-empty">
        <div className="iny-empty-icon">📚</div>
        <p>Create a class first — student commitment letters and school reports appear here once pupils upload them.</p>
      </div>
    );
  }

  return (
    <div className="iny-dash">
      <div className="iny-dash-header">
        <div>
          <h2 className="iny-dash-title">✍️ Student Inyandiko</h2>
          <p className="iny-dash-sub">
            Commitment letters, school reports, and quiz marks for every student in your classes.
          </p>
        </div>
        <div className="iny-dash-stats">
          <span><strong>{stats.students}</strong> students</span>
          <span><strong>{stats.withCommitment}</strong> commitments</span>
          <span><strong>{stats.withReports}</strong> with reports</span>
        </div>
      </div>

      <div className="iny-dash-toolbar">
        <select
          className="iny-dash-select"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="all">All classes</option>
          {data.classes.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}{c.subject ? ` · ${c.subject}` : ''}
            </option>
          ))}
        </select>
        <input
          type="search"
          className="iny-dash-search"
          placeholder="Search student name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredClasses.every((c) => !(c.students || []).length) ? (
        <div className="iny-dash-empty">
          <p>No students match your search.</p>
        </div>
      ) : (
        filteredClasses.map((cls) => (
          <section key={cls.id} className="iny-dash-class">
            <div className="iny-dash-class-head">
              <div>
                <h3>{cls.name}</h3>
                {cls.subject && <span className="iny-dash-subject">{cls.subject}</span>}
                <span className="iny-dash-code">Code {cls.class_code}</span>
              </div>
              <Link to={`${basePath}/classes/${cls.id}`} className="iny-dash-class-link">
                Open class →
              </Link>
            </div>

            {(cls.students || []).length === 0 ? (
              <p className="iny-muted">No students enrolled yet.</p>
            ) : (
              <div className="iny-dash-student-list">
                {cls.students.map((student) => {
                  const rowKey = `${cls.id}:${student.student_id}`;
                  const expanded = expandedKey === rowKey;
                  const quizTaken = (student.quiz_marks || []).filter((m) => m.taken);
                  const avgPct = quizTaken.length
                    ? Math.round(
                        quizTaken.reduce((sum, m) => sum + Number(m.percentage || 0), 0) / quizTaken.length
                      )
                    : null;

                  return (
                    <article key={rowKey} className={`iny-dash-student ${expanded ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="iny-dash-student-toggle"
                        onClick={() => setExpandedKey(expanded ? null : rowKey)}
                      >
                        <span className="iny-dash-student-name">{student.student_name}</span>
                        <span className="iny-dash-badges">
                          <span className={`iny-dash-badge ${student.commitment ? 'ok' : 'missing'}`}>
                            {student.commitment ? '🤝 Commitment' : '⏳ No commitment'}
                          </span>
                          <span className={`iny-dash-badge ${student.school_reports?.length ? 'ok' : 'missing'}`}>
                            📋 {student.school_reports?.length || 0} report{(student.school_reports?.length || 0) === 1 ? '' : 's'}
                          </span>
                          <span className="iny-dash-badge ok">
                            📝 {quizTaken.length} quiz{quizTaken.length === 1 ? '' : 'zes'}
                            {avgPct != null ? ` · ${avgPct}% avg` : ''}
                          </span>
                        </span>
                        <span className="iny-dash-chevron">{expanded ? '▲' : '▼'}</span>
                      </button>

                      {expanded && (
                        <div className="iny-dash-student-body">
                          <div className="iny-dash-student-grid">
                            <section className="iny-panel">
                              <h4 className="iny-panel-title">🤝 Commitment</h4>
                              {student.commitment ? (
                                <>
                                  <InyandikoDocViewer doc={student.commitment} compact />
                                  <a
                                    href={inyandikoFileUrl(student.commitment.file_path)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="iny-doc-link"
                                  >
                                    {student.commitment.title || student.commitment.file_name}
                                  </a>
                                </>
                              ) : (
                                <p className="iny-empty">Student has not uploaded a commitment letter yet.</p>
                              )}
                            </section>

                            <section className="iny-panel">
                              <h4 className="iny-panel-title">📋 School reports</h4>
                              {student.school_reports?.length ? (
                                <>
                                  <ul className="iny-report-list">
                                    {student.school_reports.map((doc) => (
                                      <li key={doc.id} className="iny-report-item">
                                        <a
                                          href={inyandikoFileUrl(doc.file_path)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="iny-report-link"
                                        >
                                          {doc.title || doc.file_name}
                                        </a>
                                        <span className="iny-report-date">
                                          {new Date(doc.uploaded_at).toLocaleDateString()}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                  <InyandikoDocViewer doc={student.school_reports[0]} compact />
                                </>
                              ) : (
                                <p className="iny-empty">No school reports uploaded yet.</p>
                              )}
                            </section>

                            <section className="iny-panel iny-panel--marks">
                              <h4 className="iny-panel-title">📝 Quiz marks</h4>
                              {quizTaken.length ? (
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
                                      {(student.quiz_marks || []).map((m) => (
                                        <tr key={m.quiz_id}>
                                          <td>{m.quiz_title}</td>
                                          <td>{m.taken ? `${m.score}/${m.total}` : '—'}</td>
                                          <td>{m.taken ? `${m.percentage}%` : 'Not taken'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="iny-empty">No quiz attempts yet.</p>
                              )}
                            </section>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
