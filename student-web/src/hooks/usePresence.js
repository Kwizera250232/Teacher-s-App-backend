import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const PING_MS = 30000;

export function usePresence(token) {
  const [online, setOnline] = useState([]);

  const refresh = useCallback(() => {
    if (!token) return;
    api
      .get('/presence/online', token)
      .then((data) => setOnline(data?.online || []))
      .catch(() => setOnline([]));
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const ping = () => api.post('/presence/ping', {}, token).catch(() => {});
    ping();
    refresh();
    const pingId = setInterval(ping, PING_MS);
    const pollId = setInterval(refresh, PING_MS);
    return () => {
      clearInterval(pingId);
      clearInterval(pollId);
    };
  }, [token, refresh]);

  return { online, refresh };
}
