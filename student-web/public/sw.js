const CACHE_VERSION = 'uclass-v26';
const API_CACHE = 'uclass-api-v2';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg'];

const API_CACHE_PATTERNS = [
  /\/api\/classes\/\d+\/quizzes$/,
  /\/api\/classes\/\d+\/quizzes\/\d+\/questions$/,
  /\/api\/classes\/\d+\/notes$/,
  /\/api\/classes\/\d+\/homework$/,
  /\/api\/classes\/my$/,
  /\/api\/classes$/,
  /\/api\/classroom-feed\/\d+\/posts$/,
  /\/api\/auth\/schools$/,
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
      .then(() => cacheAppShell())
  );
});

async function cacheAppShell() {
  try {
    const cache = await caches.open(CACHE_VERSION);
    const resp = await fetch('/');
    if (!resp.ok) return;
    const html = await resp.text();
    cache.put('/', new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    cache.put('/index.html', new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    const assets = [];
    const jsMatches = html.matchAll(/src="(\/assets\/[^"]+)"/g);
    for (const m of jsMatches) assets.push(m[1]);
    const cssMatches = html.matchAll(/href="(\/assets\/[^"]+\.css[^"]*)"/g);
    for (const m of cssMatches) assets.push(m[1]);
    await Promise.all(assets.map((url) =>
      fetch(url).then((r) => r.ok ? cache.put(url, r) : null).catch(() => {})
    ));
  } catch {}
}

function shouldCacheApi(url) {
  return API_CACHE_PATTERNS.some((p) => p.test(url));
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') {
    if (request.method === 'POST' && request.url.includes('/quizzes/') && request.url.includes('/submit')) {
      e.respondWith(handleQuizSubmit(request));
    }
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !url.hostname.includes('fonts')) {
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirstApi(request));
  } else if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(networkFirstStatic(request));
  } else {
    e.respondWith(cacheFirstStatic(request));
  }
});

async function networkFirstStatic(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok && shouldCacheApi(request.url)) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'You are offline. This content is not available offline yet.', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleQuizSubmit(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    const body = await request.clone().json();
    const url = request.url;
    const authHeader = request.headers.get('Authorization');
    const pending = JSON.parse((await getPendingQuizzes()) || '[]');
    pending.push({
      id: Date.now().toString(36),
      url,
      body,
      authHeader,
      timestamp: new Date().toISOString(),
    });
    await savePendingQuizzes(JSON.stringify(pending));
    notifyClients({ type: 'QUIZ_SAVED_OFFLINE', count: pending.length });
    return new Response(
      JSON.stringify({
        offline: true,
        message: 'Quiz saved offline. It will be submitted automatically when you reconnect.',
        score: null,
        total: null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function getPendingQuizzes() {
  const cache = await caches.open(API_CACHE);
  const resp = await cache.match('/_pending_quizzes');
  if (!resp) return '[]';
  return resp.text();
}

async function savePendingQuizzes(data) {
  const cache = await caches.open(API_CACHE);
  await cache.put('/_pending_quizzes', new Response(data, { headers: { 'Content-Type': 'application/json' } }));
}

function notifyClients(msg) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((c) => c.postMessage(msg));
  });
}

self.addEventListener('message', (e) => {
  if (e.data === 'SYNC_PENDING_QUIZZES') {
    syncPendingQuizzes();
  }
});

async function syncPendingQuizzes() {
  const raw = await getPendingQuizzes();
  const pending = JSON.parse(raw || '[]');
  if (pending.length === 0) return;
  const remaining = [];
  for (const quiz of pending) {
    try {
      const resp = await fetch(quiz.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(quiz.authHeader ? { Authorization: quiz.authHeader } : {}),
        },
        body: JSON.stringify(quiz.body),
      });
      if (resp.ok) {
        notifyClients({ type: 'QUIZ_SYNCED', quizId: quiz.id });
      } else {
        remaining.push(quiz);
      }
    } catch {
      remaining.push(quiz);
    }
  }
  await savePendingQuizzes(JSON.stringify(remaining));
  if (remaining.length === 0) {
    notifyClients({ type: 'ALL_QUIZZES_SYNCED' });
  }
}

self.addEventListener('push', (event) => {
  let data = { title: 'UClass', body: 'You have a new update.', url: '/', tag: 'uclass' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || 'uclass',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if (typeof client.navigate === 'function') {
            return client.focus().then(() => client.navigate(targetUrl));
          }
          client.postMessage({ type: 'OPEN_URL', url: targetPath });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
