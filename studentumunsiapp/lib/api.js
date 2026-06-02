import Constants from 'expo-constants';

export function getApiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  const base = (fromEnv || fromExtra || 'https://studentapi.umunsi.com/api').replace(/\/$/, '');
  return base;
}

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const url = `${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function login(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
  });
}

export async function registerPushToken(token, expoPushToken, platform) {
  return apiRequest('/mobile/push/register', {
    method: 'POST',
    token,
    body: { token: expoPushToken, platform },
  });
}

export async function unregisterPushToken(token, expoPushToken) {
  return apiRequest('/mobile/push/register', {
    method: 'DELETE',
    token,
    body: { token: expoPushToken },
  });
}

export async function fetchParentHub(token) {
  return apiRequest('/parent/hub', { token });
}

export async function markNotificationRead(token, id) {
  return apiRequest(`/parent/notifications/${id}/read`, { method: 'PUT', token, body: {} });
}

export async function markAllNotificationsRead(token) {
  return apiRequest('/parent/notifications/read-all', { method: 'PUT', token, body: {} });
}
