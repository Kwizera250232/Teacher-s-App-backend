import ClassMomentCard from './ClassMomentCard';

export default function ClassMomentsFeed({ moments, loading }) {
  if (loading) {
    return <p className="cm-empty">Loading moments…</p>;
  }
  if (!moments?.length) {
    return (
      <div className="cm-empty">
        <p style={{ fontSize: '2.5rem', margin: '0 0 8px' }}>📸</p>
        <p>No class moments yet. When your teacher shares photos from today&apos;s lesson, they will appear here.</p>
      </div>
    );
  }
  return (
    <div className="cm-feed">
      {moments.map((m, i) => (
        <ClassMomentCard key={m.id} moment={m} style={{ animationDelay: `${i * 0.06}s` }} />
      ))}
    </div>
  );
}
