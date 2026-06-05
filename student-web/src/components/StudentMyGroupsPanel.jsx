import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import ClassDeanHelp from './ClassDeanHelp';
import './StudentMyGroups.css';

function statusLabel(a) {
  if (a.status === 'submitted') return { text: `Done · ${a.score}/${a.total}`, color: '#166534' };
  if (a.status === 'active' && a.started_by_student_id) {
    const who = a.started_by_name ? ` · ${a.started_by_name.split(' ')[0]} started` : '';
    return { text: `In progress${who}`, color: '#b45309' };
  }
  if (a.status === 'active' || a.status === 'assigned') {
    return { text: 'New — open now', color: '#059669' };
  }
  return { text: 'Open now', color: '#059669' };
}

function GroupStatsBar({ group }) {
  const rankPts = group.points_rank && group.total_groups
    ? `#${group.points_rank} of ${group.total_groups} teams`
    : null;
  const rankQuiz = group.quiz_rank && group.total_groups
    ? `#${group.quiz_rank} on quiz marks`
    : null;

  return (
    <div className="student-group-stats">
      <div className="student-group-stat">
        <span className="student-group-stat-val">{group.points ?? 0}</span>
        <span className="student-group-stat-lbl">Team points</span>
        {rankPts && <span className="student-group-stat-rank">{rankPts}</span>}
      </div>
      <div className="student-group-stat">
        <span className="student-group-stat-val">
          {group.quiz_marks ?? 0}
          {group.quiz_marks_total > 0 ? `/${group.quiz_marks_total}` : ''}
        </span>
        <span className="student-group-stat-lbl">Quiz marks</span>
        {rankQuiz && <span className="student-group-stat-rank">{rankQuiz}</span>}
      </div>
    </div>
  );
}

export default function StudentMyGroupsPanel({
  groups,
  classId,
  className,
  token,
  loading,
  error,
  initialGroupId,
}) {
  const navigate = useNavigate();
  const [openGroupId, setOpenGroupId] = useState(initialGroupId ? Number(initialGroupId) : null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    if (initialGroupId) setOpenGroupId(Number(initialGroupId));
  }, [initialGroupId]);

  useEffect(() => {
    if (!openGroupId || !token) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError('');
    api
      .get(`/classes/${classId}/my-groups/${openGroupId}`, token)
      .then(setDetail)
      .catch((e) => setDetailError(e.message))
      .finally(() => setDetailLoading(false));
  }, [openGroupId, classId, token]);

  if (loading) {
    return <p style={{ textAlign: 'center', padding: 32, color: '#888' }}>Loading your groups…</p>;
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (!groups?.length) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
        <p style={{ fontSize: 40, margin: '0 0 12px' }}>👥</p>
        <p><strong>You are not in a group yet.</strong></p>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          Ask your teacher to add you to a group, then open your team here to see assigned quizzes.
        </p>
      </div>
    );
  }

  if (openGroupId) {
    const summary = groups.find((g) => g.id === openGroupId);
    const g = detail || summary;

    return (
      <div className="student-group-detail">
        <button type="button" className="btn btn-outline btn-sm student-group-back" onClick={() => setOpenGroupId(null)}>
          ← All groups
        </button>

        {detailLoading && !detail ? (
          <p style={{ padding: 24, color: '#888' }}>Opening group…</p>
        ) : (
          <>
            <div className="student-group-detail-head">
              <h3>👥 {g?.name}</h3>
              {g?.members?.length > 0 && (
                <p className="student-group-members">
                  Team: {g.members.map((m) => m.name.split(' ')[0]).join(', ')}
                </p>
              )}
            </div>

            {g && <GroupStatsBar group={g} />}

            <div className="student-group-dean-wrap">
              <ClassDeanHelp
                token={token}
                classId={classId}
                className={className}
                quizHint={g?.name ? `Team ${g.name} — ask about group quiz work` : ''}
              />
            </div>

            {detailError && <div className="alert alert-error">{detailError}</div>}

            {!detail?.assignments?.length ? (
              <p style={{ fontSize: 14, color: '#94a3b8', padding: '12px 0' }}>
                No quiz assigned to this group yet.
              </p>
            ) : (
              <div className="student-group-quiz-list">
                <h4 className="student-group-quiz-heading">Group quizzes</h4>
                {detail.assignments.map((a) => {
                  const st = statusLabel(a);
                  return (
                    <div key={a.id} className="student-group-quiz-card">
                      <div className="student-group-quiz-title">❓ {a.quiz_title}</div>
                      {a.quiz_description && (
                        <p className="student-group-quiz-desc">{a.quiz_description}</p>
                      )}
                      <div className="student-group-quiz-status" style={{ color: st.color }}>{st.text}</div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/student/classes/${classId}/group-quizzes/${a.id}`)}
                      >
                        {a.status === 'submitted' ? 'View result' : 'Open group quiz'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="student-group-list">
      <p className="student-group-list-hint">
        Tap a team to open it — group quizzes are only visible inside your group.
      </p>
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          className="student-group-list-card"
          onClick={() => setOpenGroupId(g.id)}
        >
          <div className="student-group-list-card-top">
            <strong>👥 {g.name}</strong>
            {(g.pending_count > 0 || g.assignment_count > 0) && (
              <span className="student-group-list-badge">
                {g.pending_count > 0 ? `${g.pending_count} to do` : `${g.assignment_count} quiz`}
              </span>
            )}
          </div>
          <GroupStatsBar group={g} />
          <span className="student-group-list-open">Open group →</span>
        </button>
      ))}
    </div>
  );
}
