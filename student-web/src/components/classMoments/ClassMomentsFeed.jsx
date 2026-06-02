import ClassMomentCard from './ClassMomentCard';

export default function ClassMomentsFeed({
  moments,
  loading,
  token,
  onReactionsChange,
  emptyContent,
}) {
  const patchReactions = (momentId, reactions) => {
    onReactionsChange?.(momentId, reactions);
  };

  if (loading) {
    return <p className="cm-wa-empty">Loading moments…</p>;
  }
  if (!moments?.length) {
    return (
      <div className="cm-wa-empty cm-wa-empty--demo">
        <div className="cm-wa-demo-bubble" aria-hidden>
          <div className="cm-wa-demo-line cm-wa-demo-line--short" />
          <div className="cm-wa-demo-photo" />
          <div className="cm-wa-demo-line" />
        </div>
        <div className="cm-wa-empty-text">{emptyContent || (
          <p>
            No class moments yet. When your teacher shares photos from today&apos;s lesson, they will appear here.
          </p>
        )}</div>
      </div>
    );
  }
  return (
    <div className="cm-soc-feed-wrap">
      <div className="cm-soc-feed">
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
