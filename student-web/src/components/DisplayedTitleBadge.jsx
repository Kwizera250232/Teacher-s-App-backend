import { titleMeta } from '../utils/achievementCatalog';
import './AchievementCelebrate.css';

export default function DisplayedTitleBadge({ titleKey, title, compact }) {
  const meta = title || titleMeta(titleKey);
  if (!meta) return null;
  return (
    <span
      className="ach-displayed-crown"
      style={compact ? { fontSize: 10, padding: '1px 6px' } : undefined}
      title={meta.label}
    >
      {meta.emoji} {meta.label}
    </span>
  );
}
