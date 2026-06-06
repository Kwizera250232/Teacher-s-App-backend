import { groupAssignmentStatusLabel } from '../utils/teacherGroupQuizzes';
import './TeacherGroupQuizSection.css';

/**
 * Team / group quiz assignments shown at the top of the teacher Quizzes tab.
 */
export default function TeacherGroupQuizSection({
  assignments,
  onRemove,
  onViewQuiz,
  onViewResults,
}) {
  if (!assignments?.length) return null;

  return (
    <section className="teacher-group-quiz-section" aria-label="Team quizzes assigned to groups">
      <div className="teacher-group-quiz-section-head">
        <div>
          <h3>👥 Team quizzes</h3>
          <p>Released to groups — also listed on each quiz card below.</p>
        </div>
        <span className="teacher-group-quiz-count">{assignments.length}</span>
      </div>
      <div className="teacher-group-quiz-grid">
        {assignments.map((a) => {
          const st = groupAssignmentStatusLabel(a);
          return (
            <article key={a.id} className={`teacher-group-quiz-card teacher-group-quiz-card--${st.tone}`}>
              <div className="teacher-group-quiz-card-top">
                <span className="teacher-group-quiz-emoji" aria-hidden>{st.emoji}</span>
                <div className="teacher-group-quiz-card-titles">
                  <strong className="teacher-group-quiz-quiz">{a.quiz_title}</strong>
                  <span className="teacher-group-quiz-group">Team {a.group_name}</span>
                </div>
                <span className={`teacher-group-quiz-status teacher-group-quiz-status--${st.tone}`}>
                  {st.text}
                </span>
              </div>
              {a.quiz_description && (
                <p className="teacher-group-quiz-desc">{a.quiz_description}</p>
              )}
              <div className="teacher-group-quiz-card-actions">
                {onViewQuiz && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onViewQuiz(a)}
                  >
                    Open quiz
                  </button>
                )}
                {a.status === 'submitted' && onViewResults && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onViewResults(a)}
                  >
                    Results
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm teacher-group-quiz-remove"
                  onClick={() => onRemove?.(a)}
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
