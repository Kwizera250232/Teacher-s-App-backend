import { useNavigate } from 'react-router-dom';

function statusLabel(a) {
  if (a.status === 'submitted') return { text: `Done · ${a.score}/${a.total}`, color: '#166534' };
  if (a.status === 'active') {
    const who = a.started_by_name ? ` · started by ${a.started_by_name.split(' ')[0]}` : '';
    return { text: `In progress${who}`, color: '#b45309' };
  }
  return { text: 'Ready to start', color: '#64748b' };
}

export default function StudentMyGroupsPanel({ groups, classId, loading, error }) {
  const navigate = useNavigate();

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
          Ask your teacher to add you to a group on the <strong>Students</strong> tab, then assign quiz work to that group.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map((g) => (
        <div
          key={g.id}
          className="item-card"
          style={{ flexDirection: 'column', alignItems: 'stretch', border: '2px solid #e0e7ff' }}
        >
          <div className="item-card-body">
            <h3 style={{ margin: '0 0 6px' }}>👥 {g.name}</h3>
            {g.members?.length > 0 && (
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Your team: {g.members.map((m) => m.name.split(' ')[0]).join(', ')}
              </p>
            )}
          </div>

          {!g.assignments?.length ? (
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#94a3b8', padding: '0 4px' }}>
              No quiz assigned to this group yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {g.assignments.map((a) => {
                const st = statusLabel(a);
                return (
                  <div
                    key={a.id}
                    style={{
                      background: '#f8fafc',
                      borderRadius: 10,
                      padding: '12px 14px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>❓ {a.quiz_title}</div>
                    {a.quiz_description && (
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b' }}>{a.quiz_description}</p>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 600, color: st.color, marginBottom: 10 }}>{st.text}</div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/student/classes/${classId}/group-quizzes/${a.id}`)}
                    >
                      {a.status === 'submitted' ? 'View result' : a.status === 'active' ? 'Continue in group' : 'Open & start quiz'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
