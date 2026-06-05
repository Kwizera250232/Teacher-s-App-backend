const API_BASE = () => import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function fetchVapidPublicKey() {
  const resp = await fetch(`${API_BASE()}/pwa/vapid-public-key`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data?.enabled || !data?.publicKey) return null;
  return data.publicKey;
}

export async function subscribeToPush(token) {
  if (!pushSupported() || !token) return { ok: false, reason: 'unsupported' };

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return { ok: false, reason: 'disabled' };

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();

  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const resp = await fetch(`${API_BASE()}/pwa/push-subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  if (!resp.ok) return { ok: false, reason: 'server' };
  return { ok: true, subscription };
}

export async function unsubscribeFromPush(token) {
  if (!pushSupported() || !token) return;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await fetch(`${API_BASE()}/pwa/push-subscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
}
