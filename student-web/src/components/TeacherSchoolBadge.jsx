/** Shows linked UClass school for staff accounts (Ishuri). */
export default function TeacherSchoolBadge({ user, style = {} }) {
  if (!user) return null;
  if (user.role !== 'teacher' && user.role !== 'head_teacher') return null;
  if (!user.school_id && !user.school_name) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 10,
        background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
        border: '1px solid #86efac',
        color: '#166534',
        fontSize: 14,
        fontWeight: 600,
        ...style,
      }}
    >
      <span aria-hidden>🏫</span>
      <span>
        Ishuri / School:{' '}
        <strong>{user.school_name || 'Linked'}</strong>
      </span>
    </div>
  );
}
