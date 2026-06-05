import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import CrownPickerSection from './CrownPickerSection';
import { titleMeta } from '../utils/achievementCatalog';
import './GroupAchievementHub.css';

/** Crown + earned titles on student profile (visible outside group). */
export default function StudentAchievementProfile({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api
      .get('/classes/my', token)
      .then((classes) => {
        if (!classes?.length) {
          setRows([]);
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

  useEffect(() => {
    load();
  }, [load]);

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
          <CrownPickerSection
            classId={row.classId}
            token={token}
            achievements={row.achievements}
            displayedTitle={row.displayed_title}
            onUpdated={load}
          />
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
