import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { roleNotificationPath } from '../utils/roleNotificationNav';

function notificationsEndpoint(role) {
  if (role === 'student') return '/student/notifications';
  if (role === 'parent') return '/parent/notifications';
  if (role === 'teacher' || role === 'head_teacher') return '/staff/notifications';
  return null;
}

const POLL_MS = 30000;

/** In-app notifications with optional browser popups (student, teacher, parent). */
export function useAppNotifications(token, role, { enablePopups = true, basePath } = {}) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const lastUnread = useRef(-1);
  const endpoint = notificationsEndpoint(role);

  const parseResponse = (data) => {
    if (Array.isArray(data)) {
      const unread = data.filter((n) => !n.is_read).length;
      return { notifications: data, unread_count: unread };
    }
    return {
      notifications: data?.notifications || [],
      unread_count: data?.unread_count ?? 0,
    };
  };

  const refresh = useCallback(() => {
    if (!token || !endpoint) return Promise.resolve();
    setLoading(true);
    return api
      .get(endpoint, token)
      .then((data) => {
        const parsed = parseResponse(data);
        setNotifications(parsed.notifications);
        setUnreadCount(parsed.unread_count);
        return parsed;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, endpoint]);

  useEffect(() => {
    if (!token || !endpoint) return undefined;

    const poll = () => {
      api
        .get(endpoint, token)
        .then((data) => {
          const parsed = parseResponse(data);
          const list = parsed.notifications;
          const unread = parsed.unread_count;
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
                const path = roleNotificationPath(latest, role, basePath);
                const popup = new Notification(latest.title || 'UClass', {
                  body: latest.body || 'You have a new update.',
                  tag: `${role}-notif-${latest.id}`,
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
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [token, role, endpoint, navigate, enablePopups, basePath]);

  const markRead = useCallback(
    async (id) => {
      if (!token || !endpoint) return;
      const readPath = role === 'parent'
        ? `/parent/notifications/${id}/read`
        : role === 'student'
          ? `/student/notifications/${id}/read`
          : `/staff/notifications/${id}/read`;
      await api.put(readPath, {}, token).catch(() => {});
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    },
    [token, role, endpoint]
  );

  const markAllRead = useCallback(async () => {
    if (!token || !endpoint) return;
    const readAllPath = role === 'parent'
      ? '/parent/notifications/read-all'
      : role === 'student'
        ? '/student/notifications/read-all'
        : '/staff/notifications/read-all';
    await api.put(readAllPath, {}, token).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [token, role, endpoint]);

  const openNotification = useCallback(
    async (n) => {
      if (!n) return;
      if (!n.is_read) await markRead(n.id);
      navigate(roleNotificationPath(n, role, basePath));
    },
    [markRead, navigate, role, basePath]
  );

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    openNotification,
    supported: Boolean(endpoint),
  };
}
