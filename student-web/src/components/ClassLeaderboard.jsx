import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import InyandikoPanel from './InyandikoPanel';
import './ClassLeaderboard.css';

const BADGE_META = {
  perfect_score: { icon: '💯', label: 'Perfect Score',    color: '#f39c12' },
  excellence:    { icon: '⭐', label: 'Excellence',       color: '#9b59b6' },
  great_job:     { icon: '🏅', label: 'Great Job',        color: '#27ae60' },
  top_student:   { icon: '🏆', label: 'Umunyeshuri #1',   color: '#e74c3c' },
  keep_going:    { icon: '💪', label: 'Komeza Wihatire',  color: '#3498db' },
};

export default function ClassLeaderboard({ classId }) {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState('quiz');
  const [entries, setEntries] = useState([]);
  const [topStudent, setTopStudent] = useState(null);
  const [perQuiz, setPerQuiz] = useState([]);
  const [compositionEntries, setCompositionEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const isStudent = user?.role === 'student';
  const isTeacher = user?.role === 'teacher' || user?.role === 'head_teacher';

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    Promise.all([
      api.get(`/classes/${classId}/leaderboard`, token),
      api.get(`/classes/${classId}/top-scorers`, token).catch(() => []),
      api.get(`/classes/${classId}/composition-leaderboard`, token).catch(() => ({ entries: [] })),
    ])
      .then(([overall, topScorers, compositions]) => {
        const overallRows = overall?.student_view
          ? (overall.entries || [])
          : (Array.isArray(overall) ? overall : []);
        const topFromPayload = overall?.top_student || overallRows[0];
        setEntries(overallRows);
        setTopStudent(topFromPayload || null);
        setPerQuiz(isStudent ? [] : (Array.isArray(topScorers) ? topScorers : []));
        const compList = compositions?.entries ?? (Array.isArray(compositions) ? compositions : []);
        setCompositionEntries(Array.isArray(compList) ? compList : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classId, token, isStudent]);

  if (loading) return <div className="lb-loading">Gutegereza...</div>;

  const top = topStudent || entries.find((e) => e.is_top_student) || entries[0];
  const tableRows = isStudent
    ? entries.filter((e) => e.is_self || e.is_top_student)
    : entries;
  const hasScores = top && Number(top.total_score) > 0;
  const quizEmpty = !top && tableRows.length === 0;

  return (
    <div className="lb-wrapper">
      <div className="lb-tabs">
        <button
          className={`lb-tab ${activeTab === 'quiz' ? 'active' : ''}`}
          onClick={() => setActiveTab('quiz')}
        >
          📝 Ibizamini
        </button>
        <button
          className={`lb-tab ${activeTab === 'composition' ? 'active' : ''}`}
          onClick={() => setActiveTab('composition')}
        >
          ✍️ Inyandiko
        </button>
      </div>

      {activeTab === 'quiz' ? (
        quizEmpty ? (
          <div className="lb-empty">
            <div style={{ fontSize: 50 }}>🏁</div>
            <p>Nta nyeshuri yazamuye ikizamini kandi igaragara hano ubu.</p>
          </div>
        ) : (
          <>
            {hasScores && (
              <div className="lb-hero">
                <div className="lb-trophy">🏆</div>
                <div className="lb-winner-name">{top.student_name}</div>
                <div className="lb-winner-score">{top.total_score} / {top.total_possible} amanota</div>
                <div className="lb-kinyarwanda">
                  🎉 Umunyeshuri wagize amanota menshi ni <strong>{top.student_name}</strong> n&apos;amanota ye{' '}
                  <strong>{top.total_score}/{top.total_possible}</strong>!
                </div>
                <div className="lb-badge-row">
                  {Object.entries(BADGE_META).slice(0, 3).map(([key, meta]) => (
                    <span key={key} className="lb-badge" style={{ borderColor: meta.color }}>
                      {meta.icon} {meta.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {perQuiz.length > 0 && (
              <div className="lb-per-quiz">
                <h3 className="lb-section-title">🥇 Abambere muri buri Suzuma Bumenyi Ryatanzwe</h3>
                <div className="lb-quiz-cards">
                  {perQuiz.map(s => (
                    <div key={s.quiz_id} className="lb-quiz-card">
                      <div className="lb-quiz-card-title">📝 {s.quiz_title}</div>
                      <div className="lb-quiz-card-winner">
                        <span className="lb-quiz-trophy">🏆</span>
                        <span className="lb-quiz-name">{s.top_student}</span>
                      </div>
                      <div className="lb-quiz-score">
                        {s.score}/{s.total}
                        <span className="lb-quiz-pct" style={{ background: pctColor(s.percentage) }}>
                          {s.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h3 className="lb-section-title" style={{ marginTop: 28 }}>
              {isStudent ? '📊 Amanota yawe' : '📊 Urutonde Rusanzwe'}
            </h3>
            {isStudent && (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                Ureba amanota yawe gusa. Umunyeshuri wa mbere agaragazwa hejuru.
              </p>
            )}
            <div className="lb-table-wrap">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Izina</th>
                    <th>Ibizamini</th>
                    <th>Amanota Yose</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((e) => (
                    <tr
                      key={e.student_id}
                      className={
                        e.is_top_student && hasScores ? 'lb-top-row' :
                        e.is_self ? 'lb-self-row' :
                        e.rank === 1 && hasScores ? 'lb-top-row' : ''
                      }
                    >
                      <td>
                        {e.is_top_student && hasScores ? '🥇' :
                         e.rank === 2 && !isStudent ? '🥈' :
                         e.rank === 3 && !isStudent ? '🥉' :
                         e.rank}
                      </td>
                      <td>
                        {e.student_name}
                        {e.is_self && isStudent && e.is_top_student ? ' (Wowe — #1)' : ''}
                        {e.is_self && isStudent && !e.is_top_student ? ' (Wowe)' : ''}
                      </td>
                      <td>{e.quizzes_taken}</td>
                      <td>{e.total_score || 0} / {e.total_possible || 0}</td>
                      <td>
                        <span className="lb-pct" style={{ background: pctColor(e.avg_percentage) }}>
                          {e.avg_percentage || 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : (
        <>
          {(isStudent || isTeacher) && (
            <InyandikoPanel classId={classId} isTeacher={isTeacher} />
          )}

          {compositionEntries.length > 0 && (
            <div className="lb-composition" style={{ marginTop: isStudent || isTeacher ? 28 : 0 }}>
              <h3 className="lb-section-title">✍️ Inyandiko Nziza</h3>
              {isStudent && (
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                  Ureba inyandiko yawe n&apos;uwatsinze gusa.
                </p>
              )}
              <div className="lb-composition-list">
                {compositionEntries.map((entry, index) => (
                  <div key={entry.student_id || entry.composition_id} className="lb-composition-item">
                    <div className="lb-comp-rank">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                    </div>
                    <div className="lb-comp-content">
                      <div className="lb-comp-title">{entry.composition_title || entry.title}</div>
                      <div className="lb-comp-author">{entry.student_name}</div>
                      <div className="lb-comp-score">Amanota: {entry.score}/100</div>
                      <div className="lb-comp-date">
                        {new Date(entry.submitted_at || entry.created_at).toLocaleDateString('rw-RW')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isStudent && !isTeacher && compositionEntries.length === 0 && (
            <div className="lb-empty">
              <div style={{ fontSize: 50 }}>📝</div>
              <p>Nta nyandiko yanditswe kandi igaragara hano ubu.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function pctColor(pct) {
  if (!pct) return '#eee';
  if (pct >= 90) return '#27ae60';
  if (pct >= 75) return '#f39c12';
  if (pct >= 50) return '#3498db';
  return '#e74c3c';
}
