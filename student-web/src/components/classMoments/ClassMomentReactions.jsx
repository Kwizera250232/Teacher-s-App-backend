import { useState } from 'react';
import { api } from '../../api';
import {
  applyReactionToggle,
  canReactToMoment,
  momentIdNum,
  normalizeReactionEmoji,
} from '../../utils/momentReactions';

const QUICK_EMOJI = ['❤️', '👍', '😂', '😮', '😢', '🙏', '👏', '🔥'];

export default function ClassMomentReactions({
  moment,
  token,
  onReactionsChange,
  disabled = false,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reactions = moment.reactions || { counts: {}, mine: null, people: [], total: 0 };
  const counts = reactions.counts || {};
  const mine = reactions.mine;
  const total = reactions.total ?? Object.values(counts).reduce((a, b) => a + b, 0);
  const momentId = momentIdNum(moment.id);

  const react = async (emoji) => {
    if (disabled || busy || !token || !momentId) return;

    const normalized = emoji == null ? '❤️' : normalizeReactionEmoji(emoji);
    const willRemove = mine === normalized;
    const previous = moment.reactions || { counts: {}, mine: null, people: [], total: 0 };
    const optimistic = applyReactionToggle(moment, emoji, willRemove, normalized);

    setPickerOpen(false);
    setBusy(true);
    onReactionsChange?.(momentId, optimistic);

    try {
      const data = await api.post(
        `/class-moments/${momentId}/react`,
        { emoji: willRemove ? normalized : emoji ?? 'like' },
        token
      );
      if (data.reactions) {
        onReactionsChange?.(momentId, data.reactions);
      }
    } catch (err) {
      onReactionsChange?.(momentId, previous);
      const msg = String(err.message || '');
      if (/404|not found/i.test(msg)) {
        alert(
          'Reactions need a server update. Ask your school to deploy the latest API, then try again.'
        );
      } else {
        alert(msg || 'Could not save reaction. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!canReactToMoment(moment)) return null;

  const summaryEmojis = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  return (
    <div className="cm-soc-reactions">
      {total > 0 && (
        <div className="cm-soc-reaction-tally" aria-label={`${total} reactions`}>
          <span className="cm-soc-reaction-tally__icons">{summaryEmojis.join('')}</span>
          <span className="cm-soc-reaction-tally__count">{total}</span>
        </div>
      )}

      <div className="cm-soc-action-bar">
        <button
          type="button"
          className={`cm-soc-action${mine === '❤️' ? ' cm-soc-action--active' : ''}`}
          disabled={disabled || busy}
          aria-label={mine === '❤️' ? 'Remove like' : 'Like'}
          onClick={() => react(mine === '❤️' ? '❤️' : 'like')}
        >
          <span className="cm-soc-action__icon" aria-hidden>
            {mine === '❤️' ? '❤️' : '🤍'}
          </span>
          Like
        </button>
        <button
          type="button"
          className={`cm-soc-action${pickerOpen ? ' cm-soc-action--active' : ''}`}
          disabled={disabled || busy}
          aria-expanded={pickerOpen}
          aria-label="Add reaction"
          onClick={() => setPickerOpen((o) => !o)}
        >
          <span className="cm-soc-action__icon" aria-hidden>
            😊
          </span>
          React
        </button>
      </div>

      {pickerOpen && (
        <div className="cm-soc-emoji-tray" role="toolbar" aria-label="Choose reaction">
          {QUICK_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              className={mine === e ? 'active' : ''}
              disabled={busy}
              aria-label={`React with ${e}`}
              onClick={() => react(e)}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
