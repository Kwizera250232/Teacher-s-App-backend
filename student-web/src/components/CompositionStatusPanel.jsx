import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { MODAL_CARD_STYLE, MODAL_OVERLAY_STYLE } from '../utils/modalOverlay';
import { loadPickableShares } from '../utils/compositionStatus';
import './CompositionStatusPanel.css';

function ReadMore({ text, max = 200 }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const needs = text.length > max;
  const shown = open || !needs ? text : `${text.slice(0, max).trim()}…`;
  return (
    <p className="csp-body">
      {shown}
      {needs && (
        <button type="button" className="csp-read-more" onClick={() => setOpen(!open)}>
          {open ? ' Show less' : ' Read more'}
        </button>
      )}
    </p>
  );
}

export default function CompositionStatusPanel({ token, onClose, openPickerInitially = false }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(null);
  const [pickable, setPickable] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [step, setStep] = useState('loading');
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      let m;
      try {
        m = await api.get('/composition-status/mine', token);
      } catch (e) {
        if (/404|not found/i.test(String(e.message))) {
          m = await api.get('/student/composition-status/mine', token);
        } else throw e;
      }
      if (m.active) {
        setMine(m.active);
        setStep('active');
        return;
      }
      const { items, pending_count: pending } = await loadPickableShares(token, api);
      setPickable(items);
      setPendingCount(pending);
      if (items.length) {
        setStep('pick');
      } else if (pending > 0) {
        setStep('pending');
      } else {
        setStep('empty');
      }
    } catch (e) {
      if (/404|not found/i.test(e.message)) {
        setError('Composition status needs a server update. Ask your school to update the API.');
      } else {
        setError(e.message);
      }
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    if (step !== 'active' || !token) return undefined;
    const refreshViewers = async () => {
      try {
        const m = await api.get('/composition-status/mine', token);
        if (m.active) setMine(m.active);
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(refreshViewers, 12000);
    return () => clearInterval(id);
  }, [step, token]);

  const publish = async (shareId) => {
    setPublishing(true);
    setError('');
    try {
      const res = await api.post('/composition-status', { share_id: shareId }, token);
      setMine(res.active);
      setStep('active');
    } catch (e) {
      const msg = String(e.message || '');
      if (e.needs_profile || msg.includes('needs_profile') || /must be approved/i.test(msg)) {
        setStep('need-profile');
      } else {
        setError(msg);
      }
    } finally {
      setPublishing(false);
    }
  };

  const goProfile = () => {
    onClose();
    navigate('/profile?compose=composition');
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...MODAL_CARD_STYLE, maxWidth: 420 }} className="csp-modal wa-theme" onClick={(e) => e.stopPropagation()}>
        <h2 className="csp-title">✍️ C. Status</h2>
        <p className="csp-sub">
          Share an approved composition for 7 days. Classmates see it on the feed — they subscribe to you to read the full text. Teachers and parents see everything.
        </p>

        {loading && <p className="csp-muted">Loading…</p>}

        {!loading && step === 'active' && mine && (
          <div className="csp-active-card">
            <div className="csp-active-ring">📌</div>
            <h3>{mine.title}</h3>
            <ReadMore text={mine.intro} />
            <p className="csp-meta">
              👁 {mine.view_count || 0} views · {mine.expires_in_days} day(s) left
            </p>
            {mine.viewers?.length > 0 && (
              <div className="csp-viewers">
                <strong>Who viewed</strong>
                <ul>
                  {mine.viewers.map((v, i) => (
                    <li key={i}>
                      {v.viewer_name} <span>({v.viewer_role})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep('pick')}>
              Change composition
            </button>
          </div>
        )}

        {!loading && step === 'empty' && (
          <div className="csp-empty">
            <div className="csp-empty-icon">✨</div>
            <p>Ready to share your approved work?</p>
            <p className="csp-muted">
              If Profile shows <strong>Approved</strong>, tap below to refresh, then pick a post for your 7-day C. Status.
              Classmates see it on the feed — subscribe to read the full text. Parents and teachers see everything.
            </p>
            <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>
              Refresh my approved posts
            </button>
            <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={goProfile}>
              Open Profile
            </button>
          </div>
        )}

        {!loading && step === 'pending' && (
          <div className="csp-empty csp-empty--pending">
            <div className="csp-empty-icon">⏳</div>
            <p>You have {pendingCount} composition{pendingCount !== 1 ? 's' : ''} waiting for approval.</p>
            <p className="csp-muted">Once approved, come back here to share as your 7-day status.</p>
            <button type="button" className="btn btn-secondary" onClick={goProfile}>
              View on Profile
            </button>
          </div>
        )}

        {!loading && step === 'need-profile' && (
          <div className="csp-empty">
            <p>Finish your composition on Profile. After teacher approval, add it as status.</p>
            <button type="button" className="btn btn-primary" onClick={goProfile}>
              Go to Profile
            </button>
          </div>
        )}

        {!loading && step === 'pick' && (
          <div className="csp-pick-list">
            <div className="csp-ready-banner">
              <span className="csp-ready-badge">✓ Approved</span>
              <p>Pick one to share for 7 days. Classmates see it on the feed — they subscribe to read the full text.</p>
            </div>
            <p className="csp-muted">Your approved posts:</p>
            {pickable.length === 0 ? (
              <button type="button" className="btn btn-primary" onClick={goProfile}>
                Write on Profile
              </button>
            ) : (
              pickable.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="csp-pick-item"
                  disabled={publishing}
                  onClick={() => publish(s.id)}
                >
                  <strong>{s.title}</strong>
                  <span className="csp-pick-type">{s.type && s.type !== 'composition' ? `${s.type} · ` : ''}{s.intro?.slice(0, 80)}…</span>
                </button>
              ))
            )}
          </div>
        )}

        {error && <p className="alert alert-error">{error}</p>}

        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
