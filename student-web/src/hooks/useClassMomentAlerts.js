import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { classMomentDetailPath } from '../utils/classMomentPaths';

/** Poll for new class moments and surface browser notifications when permitted. */
export function useClassMomentAlerts(token, role) {
  const navigate = useNavigate();
  const lastUnread = useRef(-1);

  useEffect(() => {
    if (!token || !role || typeof Notification === 'undefined') return undefined;

    const poll = () => {
      api
        .get('/class-moments/preview', token)
        .then((p) => {
          const unread = p?.unread ?? 0;
          if (
            lastUnread.current >= 0 &&
            unread > lastUnread.current &&
            Notification.permission === 'granted'
          ) {
            const latest = p.latest;
            const momentId = latest?.id;
            const title = latest?.teacher_name
              ? `📸 ${latest.teacher_name} shared class photos`
              : "📸 Today's Class Moments";
            const body =
              latest?.description?.slice(0, 120) ||
              'Your teacher has shared today\'s classroom activities. Tap to view.';
            try {
              const n = new Notification(title, {
                body,
                tag: momentId ? `class-moment-${momentId}` : 'class-moment',
              });
              n.onclick = () => {
                window.focus();
                if (momentId) navigate(classMomentDetailPath(role, momentId));
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
    const t = setInterval(poll, 45000);
    return () => clearInterval(t);
  }, [token, role, navigate]);
}
