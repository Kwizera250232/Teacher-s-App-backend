import { useState } from 'react';
import { api } from '../../api';

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

  const react = async (emoji) => {
    if (disabled || busy || !token || typeof moment.id !== 'number') return;
    setBusy(true);
    setPickerOpen(false);
    try {
      const data = await api.post(`/class-moments/${moment.id}/react`, { emoji }, token);
      onReactionsChange?.(data.reactions);
    } catch (err) {
      alert(err.message || 'Could not update reaction.');
    } finally {
      setBusy(false);
    }
  };

  const summaryEmojis = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  return (
    <div className="cm-wa-reactions">
      {total > 0 && (
        <div className="cm-wa-reaction-summary" aria-label={`${total} reactions`}>
          <span className="cm-wa-reaction-emojis">{summaryEmojis.join('')}</span>
          <span className="cm-wa-reaction-count">{total}</span>
        </div>
      )}

      <div className="cm-wa-reaction-bar">
        <button
          type="button"
          className={`cm-wa-react-btn${mine === '❤️' ? ' active' : ''}`}
          disabled={disabled || busy}
          aria-label={mine === '❤️' ? 'Remove like' : 'Like'}
          onClick={() => react(mine === '❤️' ? null : 'like')}
        >
          <span className="cm-wa-react-icon" aria-hidden>
            {mine === '❤️' ? '❤️' : '🤍'}
          </span>
          <span>Like</span>
        </button>
        <button
          type="button"
          className={`cm-wa-react-btn${pickerOpen ? ' active' : ''}`}
          disabled={disabled || busy}
          aria-expanded={pickerOpen}
          aria-label="Add reaction"
          onClick={() => setPickerOpen((o) => !o)}
        >
          <span className="cm-wa-react-icon" aria-hidden>
            😊
          </span>
          <span>React</span>
        </button>
      </div>

      {pickerOpen && (
        <div className="cm-wa-emoji-picker" role="toolbar" aria-label="Choose reaction">
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
