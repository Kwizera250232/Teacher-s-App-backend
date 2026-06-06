import './TeacherGroupsPanel.css';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

function firstName(name) {
  return String(name || 'Student').trim().split(/\s+/)[0];
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

/** Teacher view of class groups — members, points, quick actions. */
export default function TeacherGroupsPanel({
  groups,
  students,
  onAwardGroup,
  onEditGroup,
  onDeleteGroup,
  onAddGroup,
}) {
  const studentMap = new Map((students || []).map((s) => [s.id, s]));
  const totalMembers = groups.reduce((n, g) => n + (g.student_ids?.length || 0), 0);

  if (!groups.length) {
    return (
      <div className="tg-empty">
        <div className="tg-empty-icon" aria-hidden>👥</div>
        <p>No groups yet. Use <strong>Add group</strong> to create teams for behavior points.</p>
        {onAddGroup && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onAddGroup}>
            + Add group
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="teacher-groups-panel">
      <div className="tg-stats-bar">
        <div className="tg-stat">
          <span className="tg-stat-num">{groups.length}</span>
          <span className="tg-stat-label">Teams</span>
        </div>
        <div className="tg-stat">
          <span className="tg-stat-num">{totalMembers}</span>
          <span className="tg-stat-label">Members</span>
        </div>
      </div>

      <div className="tg-grid">
        {groups.map((g, idx) => {
          const memberIds = g.student_ids || [];
          const members = memberIds.map((sid) => studentMap.get(sid)).filter(Boolean);
          const accent = AVATAR_COLORS[idx % AVATAR_COLORS.length];

          return (
            <article key={g.id} className="tg-card" style={{ '--tg-accent': accent }}>
              <div className="tg-card-hero">
                <div className="tg-card-hero-top">
                  <span className="tg-card-emoji" aria-hidden>{g.leader_id ? '👑' : '👥'}</span>
                  <div className="tg-card-titles">
                    <h3 className="tg-card-name">{g.name}</h3>
                    {g.leader_name && (
                      <span className="tg-card-leader">Leader · {firstName(g.leader_name)}</span>
                    )}
                  </div>
                  {(g.points || 0) > 0 && (
                    <span className="tg-card-points" title="Team behavior points">
                      ⭐ {g.points}
                    </span>
                  )}
                </div>
                <div className="tg-member-row">
                  {members.length === 0 ? (
                    <span className="tg-no-members">No students — edit group to add members</span>
                  ) : (
                    members.slice(0, 6).map((m, mi) => (
                      <span
                        key={m.id}
                        className="tg-member-chip"
                        style={{ background: AVATAR_COLORS[mi % AVATAR_COLORS.length] }}
                        title={m.name}
                      >
                        {initials(m.name)}
                      </span>
                    ))
                  )}
                  {members.length > 6 && (
                    <span className="tg-member-more">+{members.length - 6}</span>
                  )}
                </div>
                {members.length > 0 && (
                  <p className="tg-member-names">
                    {members.map((m) => firstName(m.name)).join(' · ')}
                  </p>
                )}
              </div>

              <div className="tg-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onAwardGroup?.(g)}
                >
                  ⭐ Award points
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => onEditGroup?.(g)}>
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm tg-btn-delete"
                  onClick={() => onDeleteGroup?.(g)}
                >
                  🗑 Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
