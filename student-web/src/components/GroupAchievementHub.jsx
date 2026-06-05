import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { titleMeta } from '../utils/achievementCatalog';
import './GroupAchievementHub.css';

const REACTIONS = [
  { key: 'applaud', emoji: '👍', label: 'Applaud' },
  { key: 'congratulate', emoji: '⭐', label: 'Congratulate' },
  { key: 'celebrate', emoji: '🎉', label: 'Celebrate' },
];

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Student';
}

export default function GroupAchievementHub({ classId, groupId, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!classId || !groupId || !token) return;
    setLoading(true);
    api
      .get(`/classes/${classId}/groups/${groupId}/achievements`, token)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [classId, groupId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const react = async (feedId, reaction) => {
    try {
      await api.post(
        `/classes/${classId}/achievements/feed/${feedId}/react`,
        { reaction },
        token
      );
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading && !data) {
    return <p className="gah-loading">Loading team achievements…</p>;
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  const feed = data?.feed || [];
  const weekly = data?.hall_of_fame?.weekly || [];
  const monthly = data?.hall_of_fame?.monthly || [];

  return (
    <section className="gah-hub">
      <header className="gah-header">
        <h4>🏆 Team Hall of Fame</h4>
        <p>Celebrations stay inside your team — crowns you pick appear across class.</p>
      </header>

      {(weekly.length > 0 || monthly.length > 0) && (
        <div className="gah-hof-row">
          {weekly.length > 0 && (
            <div className="gah-hof-card">
              <h5>📅 This week</h5>
              <ul>
                {weekly.slice(0, 5).map((row, i) => {
                  const t = row.title || titleMeta(row.title_key);
                  return (
                    <li key={`w-${i}`}>
                      <span>{t?.emoji}</span>
                      <span>{firstName(row.student_name)} — {t?.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {monthly.length > 0 && (
            <div className="gah-hof-card gah-hof-card--month">
              <h5>🗓️ This month</h5>
              <ul>
                {monthly.slice(0, 5).map((row, i) => {
                  const t = row.title || titleMeta(row.title_key);
                  return (
                    <li key={`m-${i}`}>
                      <span>{t?.emoji}</span>
                      <span>{firstName(row.student_name)} — {t?.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="gah-feed">
        <h5>🎉 Achievement feed</h5>
        {feed.length === 0 ? (
          <p className="gah-feed-empty">
            Complete group quizzes and earn team points to fill this feed!
          </p>
        ) : (
          <ul className="gah-feed-list">
            {feed.map((item) => {
              const t = item.title || titleMeta(item.title_key);
              const counts = item.reaction_counts || {};
              const mine = new Set(item.my_reactions || []);
              return (
                <li key={item.id} className="gah-feed-item">
                  <div className="gah-feed-bubble">
                    <span className="gah-feed-emoji">{t?.emoji || '🏆'}</span>
                    <p className="gah-feed-headline">🎉 {item.headline}</p>
                  </div>
                  <div className="gah-reactions">
                    {REACTIONS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        className={`gah-react-btn${mine.has(r.key) ? ' gah-react-btn--on' : ''}`}
                        onClick={() => react(item.id, r.key)}
                        title={r.label}
                      >
                        {r.emoji}
                        {(counts[r.key] || 0) > 0 && (
                          <span className="gah-react-count">{counts[r.key]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
