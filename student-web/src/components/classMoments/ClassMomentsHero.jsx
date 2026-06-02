import { useNavigate } from 'react-router-dom';

export default function ClassMomentsHero({ preview, feedPath = '/student/class-moments' }) {
  const navigate = useNavigate();
  const count = preview?.today_count ?? 0;
  const unread = preview?.unread ?? 0;

  return (
    <button
      type="button"
      className="cm-hero"
      onClick={() => navigate(feedPath)}
    >
      <div className="cm-hero-inner">
        <span className="cm-hero-badge">
          📸 Today&apos;s Class Moments
          {unread > 0 ? ` · ${unread} new` : ''}
        </span>
        <h2>See today&apos;s classroom activities</h2>
        <p>
          {count > 0
            ? `${count} update${count === 1 ? '' : 's'} shared today — photos and stories from class.`
            : 'See today\'s classroom activities and learning experiences.'}
        </p>
        <span className="cm-hero-cta">View updates →</span>
      </div>
    </button>
  );
}
