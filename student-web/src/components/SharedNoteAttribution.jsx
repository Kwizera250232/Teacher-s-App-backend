import VerifiedBadge from './VerifiedBadge';

/** Badge for notes shared from another teacher at the same school */
export default function SharedNoteAttribution({ note, compact = false }) {
  if (!note?.is_shared) return null;

  const teacher = note.shared_from_teacher_name || 'Another teacher';
  const cls = note.shared_from_class_name || 'another class';
  const subject = note.shared_from_class_subject;

  return (
    <div
      className="shared-note-badge"
      style={{
        marginTop: compact ? 4 : 8,
        marginBottom: compact ? 0 : 4,
        padding: compact ? '4px 8px' : '6px 10px',
        background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
        border: '1px solid #fcd34d',
        borderRadius: 8,
        fontSize: compact ? 12 : 13,
        color: '#92400e',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <span aria-hidden>🔗</span>
      <span>
        Note from{' '}
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {teacher}
          {note.shared_from_teacher_verified && (
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
