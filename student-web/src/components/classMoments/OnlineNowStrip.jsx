import { teacherAvatarUrl } from '../../utils/momentImages';

const ROLE_LABEL = {
  student: 'Student',
  teacher: 'Teacher',
  head_teacher: 'Head teacher',
  parent: 'Parent',
};

export default function OnlineNowStrip({ online = [] }) {
  if (!online.length) {
    return (
      <div className="cm-online-strip cm-online-strip--empty">
        <span className="cm-online-dot" aria-hidden />
        <span>No one else from your school online right now — check back soon.</span>
      </div>
    );
  }

  const shown = online.slice(0, 12);
  const more = online.length - shown.length;

  return (
    <div className="cm-online-strip" aria-label="People online at your school">
      <div className="cm-online-strip-head">
        <span className="cm-online-dot cm-online-dot--live" aria-hidden />
        <strong>Online now</strong>
        <span className="cm-online-count">{online.length}</span>
      </div>
      <div className="cm-online-avatars">
        {shown.map((u) => (
          <div key={u.id} className="cm-online-person" title={`${u.name} · ${ROLE_LABEL[u.role] || u.role}`}>
            <img src={teacherAvatarUrl(u.avatar_path)} alt="" className="cm-online-avatar" />
            <span className="cm-online-name">{u.name?.split(' ')[0] || 'User'}</span>
          </div>
        ))}
        {more > 0 && <span className="cm-online-more">+{more}</span>}
      </div>
    </div>
  );
}
