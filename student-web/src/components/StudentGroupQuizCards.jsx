import { useNavigate } from 'react-router-dom';

export default function StudentGroupQuizCards({ assignments, classId, showClassName = false, emptyMessage }) {
  const navigate = useNavigate();

  if (!assignments?.length) {
    return emptyMessage ? (
      <div style={{ textAlign: 'center', padding: '24px 16px', color: '#888' }}>
        <p>{emptyMessage}</p>
      </div>
    ) : null;
  }

  return assignments.map((a) => {
    const cid = classId || a.class_id;
    return (
      <div key={`${cid}-${a.id}`} className="item-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="item-card-body">
          <h3>👥 {a.group_name}</h3>
          {showClassName && a.class_name && (
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>📚 {a.class_name}</p>
          )}
          <p style={{ margin: '4px 0', fontWeight: 600 }}>❓ {a.quiz_title}</p>
          {a.quiz_description && <p style={{ fontSize: 14, color: '#64748b' }}>{a.quiz_description}</p>}
          <div className="meta" style={{ marginTop: 8 }}>
            {a.status === 'submitted' && (
              <span style={{ color: '#166534', fontWeight: 700 }}>Submitted · {a.score}/{a.total}</span>
            )}
            {a.status === 'active' && (
              <span style={{ color: '#b45309', fontWeight: 700 }}>
                In progress{a.started_by_name ? ` · started by ${a.started_by_name.split(' ')[0]}` : ''}
              </span>
            )}
            {a.status === 'assigned' && (
              <span style={{ color: '#64748b', fontWeight: 600 }}>Ready — open and start as a group</span>
            )}
          </div>
          {a.members?.length > 0 && (
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
              Members: {a.members.map((m) => m.name.split(' ')[0]).join(', ')}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
          onClick={() => navigate(`/student/classes/${cid}/group-quizzes/${a.id}`)}
        >
          {a.status === 'submitted' ? 'View result' : a.status === 'active' ? 'Continue group work' : 'Open group & start'}
        </button>
      </div>
    );
  });
}
