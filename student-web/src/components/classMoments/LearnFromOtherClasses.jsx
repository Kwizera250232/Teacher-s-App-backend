import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import ClassMomentCard from './ClassMomentCard';
import { classMomentDetailPath } from '../../utils/classMomentPaths';

export default function LearnFromOtherClasses({ token, userRole, title }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .get('/class-moments/discover', token)
      .then((data) => setItems(data?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  const heading =
    title ||
    (userRole === 'head_teacher'
      ? '🌍 Inspiration from your school'
      : '📚 Learn from other classes');

  return (
    <section className="cm-learn-section" aria-label="Learn from other classes">
      <div className="cm-learn-head">
        <h3>{heading}</h3>
        <p>Photo moments from other classes at your school — like browsing WhatsApp status from colleagues.</p>
      </div>
      {loading && <p className="cm-wa-empty">Loading…</p>}
      {!loading && !items.length && (
        <p className="cm-learn-empty">No other class moments yet. When teachers share, they appear here.</p>
      )}
      {!loading && items.length > 0 && (
        <div className="cm-soc-feed">
          {items.slice(0, 6).map((m) => (
            <ClassMomentCard
              key={m.id}
              moment={m}
              token={token}
              onReactionsChange={(momentId, reactions) => {
                setItems((prev) =>
                  prev.map((row) => (row.id === momentId ? { ...row, reactions } : row))
                );
              }}
            />
          ))}
        </div>
      )}
      {items.length > 0 && (
        <button
          type="button"
          className="btn btn-secondary btn-sm cm-learn-more"
          onClick={() => navigate(classMomentDetailPath(userRole, items[0]?.id))}
        >
          Open class moments →
        </button>
      )}
    </section>
  );
}
