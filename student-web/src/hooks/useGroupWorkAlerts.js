import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

/** Poll for new group quiz notifications and show browser alerts when permitted. */
export function useGroupWorkAlerts(token, role) {
  const navigate = useNavigate();
  const lastUnread = useRef(-1);

  useEffect(() => {
    if (!token || role !== 'student' || typeof Notification === 'undefined') return undefined;

    const poll = () => {
      api
        .get('/student/notifications', token)
        .then((data) => {
          const unread = data?.unread_count ?? 0;
          const latest = (data?.notifications || []).find(
            (n) => !n.is_read && n.type === 'group_quiz'
          );
          if (
            lastUnread.current >= 0 &&
            unread > lastUnread.current &&
            latest &&
            Notification.permission === 'granted'
          ) {
            try {
              const url = latest.payload?.url || '/student/dashboard';
              const n = new Notification(latest.title || '👥 Group quiz ready', {
                body: latest.body || 'Open Groups to start your team quiz.',
                tag: `group-quiz-${latest.id}`,
              });
              n.onclick = () => {
                window.focus();
                navigate(url.startsWith('/') ? url : `/${url}`);
              };
            } catch {
              /* ignore */
            }
          }
          lastUnread.current = unread;
        })
        .catch(() => {});
    };

    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    poll();
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [token, role, navigate]);
}
