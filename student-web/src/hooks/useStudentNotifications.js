import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { studentNotificationPath } from '../utils/studentNotificationNav';

/** Poll student in-app notifications; optional browser popups when unread count rises. */
export function useStudentNotifications(token, role, { enablePopups = true } = {}) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const lastUnread = useRef(-1);

  const refresh = useCallback(() => {
    if (!token || role !== 'student') return Promise.resolve();
    setLoading(true);
    return api
      .get('/student/notifications', token)
      .then((data) => {
        setNotifications(data?.notifications || []);
        setUnreadCount(data?.unread_count ?? 0);
        return data;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, role]);

  useEffect(() => {
    if (!token || role !== 'student') return undefined;

    const poll = () => {
      api
        .get('/student/notifications', token)
        .then((data) => {
          const list = data?.notifications || [];
          const unread = data?.unread_count ?? 0;
          setNotifications(list);
          setUnreadCount(unread);

          if (
            enablePopups &&
            typeof Notification !== 'undefined' &&
            lastUnread.current >= 0 &&
            unread > lastUnread.current &&
            Notification.permission === 'granted'
          ) {
            const latest = list.find((n) => !n.is_read);
            if (latest) {
              try {
                const path = studentNotificationPath(latest, role);
                const popup = new Notification(latest.title || 'UClass', {
                  body: latest.body || 'You have a new update.',
                  tag: `student-notif-${latest.id}`,
                });
                popup.onclick = () => {
                  window.focus();
                  navigate(path);
                };
              } catch {
                /* ignore */
              }
            }
          }
          lastUnread.current = unread;
        })
        .catch(() => {});
    };

    if (enablePopups && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    poll();
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [token, role, navigate, enablePopups]);

  const markRead = useCallback(
    async (id) => {
      if (!token) return;
      await api.put(`/student/notifications/${id}/read`, {}, token).catch(() => {});
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    },
    [token]
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    await api.put('/student/notifications/read-all', {}, token).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [token]);

  const openNotification = useCallback(
    async (n) => {
      if (!n) return;
      if (!n.is_read) await markRead(n.id);
      navigate(studentNotificationPath(n, role));
    },
    [markRead, navigate, role]
  );

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    openNotification,
  };
}
