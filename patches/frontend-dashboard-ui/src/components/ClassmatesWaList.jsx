import { UPLOADS_BASE } from '../api';

/** WhatsApp-style classmate rows (student dashboard & class page). */
export default function ClassmatesWaList({ people = [], onSelect, emptyHint }) {
  if (!people.length) {
    return emptyHint ? <p className="wa-section-hint">{emptyHint}</p> : null;
  }

  return (
    <div className="wa-class-list">
      {people.map((m) => {
        const initials = (m.name || '?')
          .split(' ')
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
        const avatarUrl = m.avatar_path ? `${UPLOADS_BASE}${m.avatar_path}` : null;
        const preview = m.class_name
          ? `${m.class_name} · Tap to chat`
          : m.role === 'teacher'
            ? 'Teacher · Tap to view'
            : 'Classmate · Tap to view';

        return (
          <button
            key={m.id}
            type="button"
            className="wa-class-row wa-class-row--mate"
            onClick={() => onSelect?.(m)}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="wa-class-avatar wa-class-avatar--photo" />
            ) : (
              <div className="wa-class-avatar wa-class-avatar--mate">{initials.slice(0, 1)}</div>
            )}
            <div className="wa-class-body">
              <strong>{m.name}</strong>
              <span className="wa-preview">{preview}</span>
            </div>
            <span className="wa-class-time">›</span>
          </button>
        );
      })}
    </div>
  );
}
