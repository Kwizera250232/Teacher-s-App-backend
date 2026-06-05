import { useState } from 'react';
import { api } from '../api';
import { titleMeta } from '../utils/achievementCatalog';
import DisplayedTitleBadge from './DisplayedTitleBadge';
import './AchievementCelebrate.css';

/** Change worn crown from inside the team room (earned titles only). */
export default function CrownPickerSection({
  classId,
  token,
  achievements = [],
  displayedTitle,
  onUpdated,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unique = [];
  const seen = new Set();
  for (const a of achievements) {
    if (!a?.title_key || seen.has(a.title_key)) continue;
    seen.add(a.title_key);
    unique.push(a);
  }

  if (!unique.length) return null;

  const pick = async (titleKey) => {
    setBusy(true);
    setError('');
    try {
      await api.put(
        `/classes/${classId}/achievements/displayed-title`,
        { title_key: titleKey },
        token
      );
      setOpen(false);
      onUpdated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sg-crown-picker">
      <div className="sg-crown-picker-head">
        <h4>👑 Your crown</h4>
        {displayedTitle ? (
          <DisplayedTitleBadge title={displayedTitle} />
        ) : (
          <span className="sg-crown-none">No crown worn yet</span>
        )}
      </div>
      <p className="sg-crown-hint">
        Classmates see your crown on the leaderboard and profile — celebrations stay in this team.
      </p>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Close' : 'Change crown'}
      </button>
      {open && (
        <div className="ach-title-pick-grid" style={{ marginTop: 12 }}>
          {unique.map((a) => {
            const meta = titleMeta(a.title_key) || a;
            const active = displayedTitle?.title_key === a.title_key;
            return (
              <button
                key={a.title_key}
                type="button"
                className={`ach-title-pick${active ? ' ach-title-pick--active' : ''}`}
                style={{ borderColor: active ? meta.color : undefined }}
                disabled={busy}
                onClick={() => pick(a.title_key)}
              >
                <span className="ach-title-pick-emoji">{meta.emoji}</span>
                <span className="ach-title-pick-label">{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="alert alert-error" style={{ marginTop: 8 }}>{error}</p>}
    </section>
  );
}
