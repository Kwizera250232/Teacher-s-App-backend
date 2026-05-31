import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import './StudentCompositionWall.css';

function parseComposition(content) {
  const lines = (content || '').split('\n');
  const title = lines[0]?.replace(/^📌\s*/, '') || 'Composition';
  let intro = '';
  let body = '';
  let conclusion = '';
  let section = null;
  const buf = [];
  const flush = () => {
    const text = buf.join('\n').trim();
    buf.length = 0;
    if (section === 'intro') intro = text;
    else if (section === 'body') body = text;
    else if (section === 'conc') conclusion = text;
  };
  for (const line of lines.slice(1)) {
    if (line === '📖 Introduction') {
      flush();
      section = 'intro';
    } else if (line === '📝 Body') {
      flush();
      section = 'body';
    } else if (line === '🏁 Conclusion') {
      flush();
      section = 'conc';
    } else {
      buf.push(line);
    }
  }
  flush();
  return { title, intro, body, conclusion };
}

function ReadMoreBlock({ label, text, maxLen = 140 }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const needsMore = text.length > maxLen;
  const shown = open || !needsMore ? text : `${text.slice(0, maxLen).trim()}…`;
  return (
    <div className="scw-section">
      {label && <div className="scw-section-label">{label}</div>}
      <p className="scw-section-text">{shown}</p>
      {needsMore && (
        <button type="button" className="scw-read-more" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

function CompositionBubble({ share, onPin, pinning }) {
  const { user } = useAuth();
  const isOwn = user?.id === share.student_id;
  const { title, intro, body, conclusion } = parseComposition(share.content);
  const status = share.status;

  return (
    <article className={`scw-bubble${share.pinned ? ' scw-bubble--pinned' : ''}`}>
      <div className="scw-bubble-meta">
        <div className="scw-avatar">{(share.student_name || '?').slice(0, 1)}</div>
        <div className="scw-bubble-head">
          <strong>{share.student_name}</strong>
          <span className="scw-bubble-sub">
            {share.class_name && `${share.class_name} · `}
            {new Date(share.created_at).toLocaleDateString()}
          </span>
        </div>
        {share.pinned && <span className="scw-pin-badge">📌 Pinned</span>}
        {isOwn && status !== 'approved' && (
          <span className={`scw-status scw-status--${status}`}>{status}</span>
        )}
      </div>
      <h3 className="scw-title">{title}</h3>
      <ReadMoreBlock label="Introduction" text={intro} />
      <ReadMoreBlock label="Body" text={body} maxLen={200} />
      <ReadMoreBlock label="Conclusion" text={conclusion} />
      {isOwn && status === 'approved' && (
        <div className="scw-actions">
          <button
            type="button"
            className="scw-pin-btn"
            disabled={pinning === share.id}
            onClick={() => onPin(share)}
          >
            {share.pinned ? '📌 Unpin' : '📍 Pin for class & parent'}
          </button>
        </div>
      )}
      {isOwn && status === 'pending' && (
        <p className="scw-hint">Waiting for teacher approval — then you can pin for classmates and parents.</p>
      )}
    </article>
  );
}

export default function StudentCompositionWall({ token, onWriteClick }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pinning, setPinning] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/student-shares/dashboard', token)
      .then(setItems)
      .catch(() => api.get('/student-shares?type=composition', token).then(setItems).catch(() => setItems([])))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const handlePin = async (share) => {
    setPinning(share.id);
    try {
      await api.patch(`/student-shares/${share.id}/pin`, { pinned: !share.pinned }, token);
      setItems((prev) =>
        prev
          .map((s) => (s.id === share.id ? { ...s, pinned: !s.pinned } : s))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned))
      );
    } catch {
      /* ignore */
    } finally {
      setPinning(null);
    }
  };

  return (
    <section className="scw-wall">
      <div className="scw-wall-header">
        <h2>✍️ Compositions</h2>
        <button type="button" className="scw-write-btn" onClick={onWriteClick}>
          + Write
        </button>
      </div>
      <p className="scw-wall-desc">
        Pin your approved work so parents, teachers, and classmates see it first.
      </p>
      {loading ? (
        <p className="scw-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="scw-empty">
          <p>No compositions yet.</p>
          <button type="button" className="scw-write-btn" onClick={onWriteClick}>
            Write your first composition
          </button>
        </div>
      ) : (
        <div className="scw-list">
          {items.map((s) => (
            <CompositionBubble key={s.id} share={s} onPin={handlePin} pinning={pinning} />
          ))}
        </div>
      )}
      <Link to="/profile" className="scw-profile-link">
        Full composer on Profile →
      </Link>
    </section>
  );
}
