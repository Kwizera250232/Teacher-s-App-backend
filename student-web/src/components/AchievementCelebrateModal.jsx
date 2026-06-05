import { useState } from 'react';
import { api } from '../api';
import { titleMeta } from '../utils/achievementCatalog';
import './AchievementCelebrate.css';

/**
 * Shown after quiz submit inside group flow — pick a crown title visible outside the team.
 */
export default function AchievementCelebrateModal({
  classId,
  groupId,
  token,
  achievements = [],
  score,
  total,
  onDone,
}) {
  const [picked, setPicked] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const unique = [];
  const seen = new Set();
  for (const a of achievements) {
    if (!a?.title_key || seen.has(a.title_key)) continue;
    seen.add(a.title_key);
    unique.push(a);
  }

  if (!unique.length) return null;

  const save = async () => {
    if (!picked) {
      onDone?.();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.put(
        `/classes/${classId}/achievements/displayed-title`,
        { title_key: picked },
        token
      );
      onDone?.(picked);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="ach-celebrate-backdrop">
      <div className="ach-celebrate-modal">
        <div className="ach-celebrate-confetti">🎉✨🏆</div>
        <h2>You earned new titles!</h2>
        {score != null && (
          <p className="ach-celebrate-score">
            Your team scored <strong>{score}/{total}</strong> ({pct}%)
          </p>
        )}
        <p className="ach-celebrate-hint">
          Pick one title to wear as your <strong>crown</strong> — classmates will see it on the leaderboard and your profile.
        </p>

        <div className="ach-title-pick-grid">
          {unique.map((a) => {
            const meta = titleMeta(a.title_key) || a;
            const active = picked === a.title_key;
            return (
              <button
                key={a.title_key}
                type="button"
                className={`ach-title-pick${active ? ' ach-title-pick--active' : ''}`}
                style={{ borderColor: active ? meta.color : undefined }}
                onClick={() => setPicked(a.title_key)}
              >
                <span className="ach-title-pick-emoji">{meta.emoji}</span>
                <span className="ach-title-pick-label">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="alert alert-error">{error}</p>}

        <div className="ach-celebrate-actions">
          <button type="button" className="btn btn-outline" onClick={() => onDone?.()}>
            Skip for now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !picked}
            onClick={save}
          >
            {saving ? 'Saving…' : '👑 Wear this crown'}
          </button>
        </div>
        {groupId && (
          <p className="ach-celebrate-foot">
            Your team celebration continues inside your group room.
          </p>
        )}
      </div>
    </div>
  );
}
