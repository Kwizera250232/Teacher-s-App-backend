import VerifiedBadge from './VerifiedBadge';

/** Badge for quizzes shared from another teacher at the same school */
export default function SharedQuizAttribution({ quiz, compact = false }) {
  if (!quiz?.is_shared) return null;

  const teacher = quiz.shared_from_teacher_name || 'Another teacher';
  const cls = quiz.shared_from_class_name || 'another class';
  const subject = quiz.shared_from_class_subject;

  return (
    <div
      className="shared-quiz-badge"
      style={{
        marginTop: compact ? 4 : 8,
        marginBottom: compact ? 0 : 4,
        padding: compact ? '4px 8px' : '6px 10px',
        background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
        border: '1px solid #86efac',
        borderRadius: 8,
        fontSize: compact ? 12 : 13,
        color: '#166534',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <span aria-hidden>🔗</span>
      <span>
        Quiz from{' '}
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {teacher}
          {quiz.shared_from_teacher_verified && (
            <VerifiedBadge
              size={compact ? 12 : 14}
              info={{
                items: [
                  { icon: '✓', label: 'Verified teacher', value: 'Approved at your school' },
                  { icon: '📚', label: 'Original class', value: subject ? `${cls} · ${subject}` : cls },
                ],
              }}
            />
          )}
        </strong>
        {' '}
        · Class <strong>{cls}</strong>
        {subject ? ` (${subject})` : ''}
      </span>
    </div>
  );
}
