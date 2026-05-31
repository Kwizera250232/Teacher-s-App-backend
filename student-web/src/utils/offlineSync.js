let listeners = [];

export function onOfflineEvent(callback) {
  listeners.push(callback);
  return () => { listeners = listeners.filter((l) => l !== callback); };
}

function notifyListeners(event) {
  listeners.forEach((l) => l(event));
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type) notifyListeners(e.data);
  });

  window.addEventListener('online', () => {
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage('SYNC_PENDING_QUIZZES');
    });
    notifyListeners({ type: 'ONLINE' });
  });

  window.addEventListener('offline', () => {
    notifyListeners({ type: 'OFFLINE' });
  });
}

export function isOnline() {
  return navigator.onLine;
}

export function triggerSync() {
  if ('serviceWorker' in navigator && navigator.onLine) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage('SYNC_PENDING_QUIZZES');
    });
  }
}
