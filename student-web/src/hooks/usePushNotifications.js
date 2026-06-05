import { useEffect } from 'react';
import { subscribeToPush, pushSupported } from '../utils/pushNotifications';

/** Register Web Push when user is logged in (installed PWA or browser tab). */
export function usePushNotifications(token) {
  useEffect(() => {
    if (!token || !pushSupported()) return undefined;

    subscribeToPush(token).catch(() => {});
    return undefined;
  }, [token]);
}
