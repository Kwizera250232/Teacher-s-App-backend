import ClassMomentCard from './ClassMomentCard';

export default function ClassMomentsFeed({ moments, loading, token, onReactionsChange }) {
  const patchReactions = (momentId, reactions) => {
    onReactionsChange?.(momentId, reactions);
  };

  if (loading) {
    return <p className="cm-wa-empty">Loading moments…</p>;
  }
  if (!moments?.length) {
    return (
      <div className="cm-wa-empty">
        <p className="cm-wa-empty-icon" aria-hidden>
          📸
        </p>
        <p>
          No class moments yet. When your teacher shares photos from today&apos;s lesson, they
          will appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="cm-wa-feed-wrap">
    <div className="cm-wa-feed">
      {moments.map((m, i) => (
        <ClassMomentCard
          key={m.id}
          moment={m}
          token={token}
          style={{ animationDelay: `${i * 0.05}s` }}
          onReactionsChange={patchReactions}
        />
      ))}
    </div>
    </div>
  );
}
