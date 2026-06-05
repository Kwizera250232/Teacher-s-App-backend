import './GroupQuizResult.css';

const GRADE_EMOJI = {
  star5: '⭐⭐⭐⭐⭐',
  star4: '⭐⭐⭐⭐',
  star3: '⭐⭐⭐',
  growing: '🌱 Growing',
  support: '🤝 Needs support',
};

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Student';
}

export default function GroupQuizResultPanel({
  assignment,
  resultSummary,
  onBack,
}) {
  const summary = resultSummary || assignment?.result_summary;
  if (!summary) return null;

  const { score, total, percentage, group_stats: gs, reflection, roster, submitted_by_name, submitted_at } = summary;
  const quizTitle = assignment?.quiz_title || 'Group quiz';
  const groupName = assignment?.group_name || 'Your team';

  return (
    <div className="gqr-page">
      <div className="gqr-hero">
        <div className="gqr-hero-glow" aria-hidden />
        <p className="gqr-hero-eyebrow">👥 {groupName}</p>
        <h2 className="gqr-hero-title">{quizTitle}</h2>
        <div className="gqr-score-ring">
          <span className="gqr-score-big">{score}</span>
          <span className="gqr-score-of">/ {total}</span>
        </div>
        <p className="gqr-score-pct">{percentage}% team score</p>
        {submitted_by_name && (
          <p className="gqr-submitted-by">
            Submitted by {firstName(submitted_by_name)}
            {submitted_at ? ` · ${new Date(submitted_at).toLocaleDateString()}` : ''}
          </p>
        )}
      </div>

      {gs?.total_groups > 1 && (
        <div className="gqr-ranks">
          {gs.quiz_rank != null && (
            <div className="gqr-rank-card gqr-rank-card--quiz">
              <span className="gqr-rank-medal">{rankMedal(gs.quiz_rank)}</span>
              <div>
                <strong>Quiz rank</strong>
                <span>{gs.quiz_rank} of {gs.total_groups} teams</span>
              </div>
            </div>
          )}
          {gs.points_rank != null && (
            <div className="gqr-rank-card gqr-rank-card--points">
              <span className="gqr-rank-medal">{rankMedal(gs.points_rank)}</span>
              <div>
                <strong>Points rank</strong>
                <span>{gs.points_rank} of {gs.total_groups} teams</span>
              </div>
            </div>
          )}
        </div>
      )}

      {reflection?.teacher_comment && (
        <section className="gqr-teacher-card">
          <div className="gqr-teacher-head">
            <span className="gqr-teacher-icon">💬</span>
            <div>
              <strong>Teacher&apos;s comment</strong>
              {reflection.teacher_name && (
                <span className="gqr-teacher-name">{reflection.teacher_name}</span>
              )}
            </div>
          </div>
          <p className="gqr-teacher-body">{reflection.teacher_comment}</p>
          {reflection.teacher_commented_at && (
            <time className="gqr-teacher-time">
              {new Date(reflection.teacher_commented_at).toLocaleString()}
            </time>
          )}
        </section>
      )}

      {!reflection?.teacher_comment && (
        <section className="gqr-teacher-card gqr-teacher-card--pending">
          <span>✨</span>
          <p>Your teacher can reply from <strong>Quiz reports</strong> — check back for their comment!</p>
        </section>
      )}

      <section className="gqr-roster">
        <h3 className="gqr-roster-title">🏅 Team roster &amp; teammate marks</h3>
        <ul className="gqr-roster-list">
          {(roster || assignment?.members || []).map((m) => (
            <li key={m.id} className={`gqr-member${m.is_leader ? ' gqr-member--leader' : ''}`}>
              <div className="gqr-member-avatar">
                {m.is_leader ? '👑' : (m.team_role_meta?.emoji || '🧑‍🎓')}
              </div>
              <div className="gqr-member-body">
                <strong>{firstName(m.name)}</strong>
                {m.team_role_meta && (
                  <span className="gqr-member-role">{m.team_role_meta.label}</span>
                )}
                {m.teammate_grade && (
                  <span className="gqr-member-grade">
                    {GRADE_EMOJI[m.teammate_grade] || m.teammate_grade}
                  </span>
                )}
                {m.leader_comment && (
                  <p className="gqr-member-note">💬 {m.leader_comment}</p>
                )}
                {m.showed_weakness && (
                  <p className="gqr-member-weak">📉 {m.showed_weakness}</p>
                )}
                {m.help_needed && (
                  <p className="gqr-member-help">🙋 {m.help_needed}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {reflection && (reflection.difficulty || reflection.improvement) && (
        <section className="gqr-reflection-notes">
          <h3>📋 Team reflection</h3>
          {reflection.difficulty && (
            <p><strong>Difficulty:</strong> {reflection.difficulty}</p>
          )}
          {reflection.improvement && (
            <p><strong>Next time:</strong> {reflection.improvement}</p>
          )}
          {reflection.student_question && (
            <p><strong>Question for teacher:</strong> {reflection.student_question}</p>
          )}
        </section>
      )}

      {onBack && (
        <button type="button" className="btn btn-primary btn-full gqr-back-btn" onClick={onBack}>
          ← Back to team room
        </button>
      )}
    </div>
  );
}
