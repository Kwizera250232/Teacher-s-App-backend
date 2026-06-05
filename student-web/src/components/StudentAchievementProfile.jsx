import { useEffect, useState } from 'react';
import { api } from '../api';
import DisplayedTitleBadge from './DisplayedTitleBadge';
import { titleMeta } from '../utils/achievementCatalog';
import './GroupAchievementHub.css';

/** Crown + earned titles on student profile (visible outside group). */
export default function StudentAchievementProfile({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .get('/classes/my', token)
      .then((classes) => {
        if (!classes?.length) {
          setRows([]);
          setLoading(false);
          return;
        }
        return Promise.all(
          classes.map((c) =>
            api.get(`/classes/${c.id}/achievements/mine`, token).catch(() => null).then((data) => ({
              classId: c.id,
              className: c.name,
              ...(data || {}),
            }))
          )
        ).then((list) => setRows(list.filter((r) => r.displayed_title || r.achievements?.length)));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return null;
  if (!rows.length) return null;

  return (
    <section className="gah-hub" style={{ marginBottom: 20 }}>
      <header className="gah-header">
        <h4>👑 Your crowns & titles</h4>
        <p>Titles you wear are visible on leaderboard and to classmates.</p>
      </header>
      {rows.map((row) => (
        <div key={row.classId} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
            {row.className}
          </div>
          {row.displayed_title && (
            <div style={{ marginBottom: 8 }}>
              <DisplayedTitleBadge title={row.displayed_title} />
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>Wearing now</span>
            </div>
          )}
          {row.achievements?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {row.achievements.slice(0, 8).map((a) => {
                const t = titleMeta(a.title_key);
                if (!t) return null;
                return (
                  <span
                    key={`${row.classId}-${a.title_key}-${a.period_key || ''}`}
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 8,
                      background: '#f1f5f9',
                    }}
                  >
                    {t.emoji} {t.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
