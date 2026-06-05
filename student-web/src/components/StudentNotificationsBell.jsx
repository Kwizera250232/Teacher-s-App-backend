import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStudentNotifications } from '../hooks/useStudentNotifications';
import { notificationIcon } from '../utils/studentNotificationNav';
import './StudentNotifications.css';

export default function StudentNotificationsBell({ className = '' }) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  const {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAllRead,
    openNotification,
  } = useStudentNotifications(token, user?.role);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const onDoc = (e) => {
      if (
        panelRef.current?.contains(e.target) ||
        btnRef.current?.contains(e.target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open, refresh]);

  if (user?.role !== 'student' || !token) return null;

  return (
    <div className={`student-notif-bell-wrap ${className}`.trim()}>
      <button
        ref={btnRef}
        type="button"
        className="student-notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <span className="student-notif-bell-icon" aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="student-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="student-notif-backdrop"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div ref={panelRef} className="student-notif-panel" role="dialog" aria-label="Notifications">
            <div className="student-notif-panel-head">
              <strong>Notifications</strong>
              <div className="student-notif-panel-actions">
                {unreadCount > 0 && (
                  <button type="button" className="student-notif-mark-all" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
                <button type="button" className="student-notif-close" onClick={() => setOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            <div className="student-notif-list">
              {loading && !notifications.length ? (
                <p className="student-notif-empty">Loading…</p>
              ) : notifications.length ? (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`student-notif-item${n.is_read ? '' : ' student-notif-item--unread'}`}
                    onClick={() => {
                      setOpen(false);
                      openNotification(n);
                    }}
                  >
                    <span className="student-notif-item-icon" aria-hidden>
                      {notificationIcon(n.type)}
                    </span>
                    <span className="student-notif-item-body">
                      <span className="student-notif-item-title">{n.title}</span>
                      <span className="student-notif-item-text">{n.body}</span>
                      <span className="student-notif-item-time">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="student-notif-empty">No notifications yet. You&apos;ll see class updates here.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
