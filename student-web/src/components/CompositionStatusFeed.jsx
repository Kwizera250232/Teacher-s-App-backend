import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import './CompositionStatusPanel.css';

function StatusCard({ item, token, currentUserId, onSubscribe }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [subLoading, setSubLoading] = useState(false);

  const open = async () => {
    const next = expanded ? null : item.id;
    setExpanded(next);
    if (!next) return;
    setLoadingDetail(true);
    try {
      await api.post(`/composition-status/${item.id}/view`, {}, token);
      const d = await api.get(`/composition-status/${item.id}/detail`, token);
      setDetail(d);
    } catch {
      setDetail(item);
    } finally {
      setLoadingDetail(false);
    }
  };

  const row = detail || item;
  const locked = row.locked && !row.can_view_full;
  const isOwner = row.student_id === currentUserId;

  const subscribe = async () => {
    if (!row.subscribe_target_id) return;
    setSubLoading(true);
    try {
      await api.post(`/profile/${row.subscribe_target_id}/subscribe`, {}, token);
      onSubscribe?.(row.subscribe_target_id);
      const d = await api.get(`/composition-status/${item.id}/detail`, token);
      setDetail(d);
    } catch {
      /* ignore */
    } finally {
      setSubLoading(false);
    }
  };

  return (
    <article className={`csp-feed-card${locked ? ' csp-feed-card--locked' : ''}`}>
      <button type="button" className="csp-feed-head" onClick={open}>
        <span className="csp-feed-avatar">{(row.student_name || '?').slice(0, 1)}</span>
        <span className="csp-feed-meta">
          <strong>{row.student_name}</strong>
          <small>{row.title} · {row.expires_in_days ?? '?'}d left · 👁 {row.view_count || 0}</small>
        </span>
        <span className="csp-feed-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="csp-feed-body">
          {loadingDetail && <p className="csp-muted">Loading…</p>}
          {!loadingDetail && locked && !isOwner && (
            <div className="csp-lock-panel">
              <div className="csp-lock-icon">🔒</div>
              <p>{row.lock_message || 'Subscribe to read the full composition.'}</p>
              <p className="csp-lock-teaser">{row.intro}</p>
              <button type="button" className="csp-subscribe-btn" disabled={subLoading} onClick={subscribe}>
                {subLoading ? 'Subscribing…' : `✨ Subscribe to ${row.student_name}`}
              </button>
            </div>
          )}
          {!loadingDetail && !locked && (
            <>
              <p className="csp-body">{row.intro}</p>
              {row.content && row.content.length > 400 && (
                <p className="csp-muted" style={{ fontSize: 12 }}>
                  Open their Profile for the full composition.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function CompositionStatusFeed({ token, compact = false }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/composition-status/feed', token)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return <p className="csp-muted">{compact ? 'Loading statuses…' : 'Loading C. Status feed…'}</p>;
  }
  if (!items.length) {
    return (
      <div className="csp-feed-empty">
        <span className="csp-feed-empty-icon">✍️</span>
        <p>No active C. Status this week. Be the first — tap <strong>C. Status</strong> to share yours!</p>
      </div>
    );
  }

  return (
    <section className={`csp-feed-section${compact ? ' csp-feed-section--compact' : ''}`}>
      {!compact && (
        <header className="csp-feed-header">
          <h2>✍️ C. Status at your school</h2>
          <p>Classmates share approved work for 7 days. Parents and teachers read everything — subscribe to a classmate to unlock their full text.</p>
        </header>
      )}
      <div className="csp-feed-list">
        {items.map((item) => (
          <StatusCard
            key={item.id}
            item={item}
            token={token}
            currentUserId={user?.id}
            onSubscribe={() => setRefreshKey((k) => k + 1)}
          />
        ))}
      </div>
    </section>
  );
}
