import { useState, useEffect } from 'react';
import { api } from '../api';
import { MODAL_CARD_STYLE, MODAL_OVERLAY_STYLE } from '../utils/modalOverlay';

function excerpt(text, max = 120) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function ShareCompositionModal({ token, receiverId, receiverName, onClose, onSent }) {
  const [compositions, setCompositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await api.get('/student-shares?type=composition', token);
        const mine = (rows || []).filter((r) => r.status === 'approved' || r.status === 'pending');
        if (!cancelled) setCompositions(mine);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load compositions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const sendComposition = async (share) => {
    if (!receiverId || sending) return;
    setSending(true);
    setError('');
    try {
      const title = share.class_name || share.school || 'My composition';
      const body = excerpt(share.content, 400);
      const content = [
        '📄 Composition shared with you',
        '',
        `Title: ${title}`,
        body ? `\n${body}` : '',
        '',
        '— Shared via UClass · Dean',
      ].join('\n').trim();
      await api.post('/messages', { receiver_id: receiverId, content }, token);
      onSent?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{ ...MODAL_OVERLAY_STYLE, zIndex: 5600 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...MODAL_CARD_STYLE, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Share composition to…</h2>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 14 }}>
          {receiverName ? (
            <>Send one of your compositions to <strong>{receiverName}</strong>.</>
          ) : (
            <>Choose a composition to share in this chat.</>
          )}
        </p>
        {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
        {error && <p className="alert alert-error">{error}</p>}
        {!loading && compositions.length === 0 && (
          <p style={{ color: '#64748b' }}>
            You have no compositions yet. Write one from C. Status or your class feed first.
          </p>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', maxHeight: 280, overflowY: 'auto' }}>
          {compositions.map((c) => (
            <li key={c.id} style={{ marginBottom: 8 }}>
              <button
                type="button"
                disabled={sending}
                onClick={() => sendComposition(c)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                <strong style={{ display: 'block', marginBottom: 4 }}>
                  {c.class_name || 'Composition'}
                  {c.status === 'pending' ? ' · pending review' : ''}
                </strong>
                <span style={{ fontSize: 13, color: '#64748b' }}>{excerpt(c.content, 80)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
