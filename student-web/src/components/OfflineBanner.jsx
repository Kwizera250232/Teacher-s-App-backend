import { useState, useEffect } from 'react';
import { onOfflineEvent, isOnline } from '../utils/offlineSync';

export default function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    const unsub = onOfflineEvent((event) => {
      if (event.type === 'ONLINE') setOnline(true);
      if (event.type === 'OFFLINE') setOnline(false);
      if (event.type === 'QUIZ_SAVED_OFFLINE') {
        setSyncMsg(`Quiz saved offline (${event.count} pending)`);
        setTimeout(() => setSyncMsg(''), 5000);
      }
      if (event.type === 'QUIZ_SYNCED') {
        setSyncMsg('Quiz submitted successfully!');
        setTimeout(() => setSyncMsg(''), 4000);
      }
      if (event.type === 'ALL_QUIZZES_SYNCED') {
        setSyncMsg('All pending quizzes submitted!');
        setTimeout(() => setSyncMsg(''), 4000);
      }
    });
    return unsub;
  }, []);

  return (
    <>
      {!online && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#f59e0b', color: '#78350f', textAlign: 'center',
          padding: '6px 16px', fontSize: 13, fontWeight: 700,
        }}>
          📡 You are offline — viewing cached content
        </div>
      )}
      {syncMsg && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#065f46', color: '#fff', borderRadius: 12,
          padding: '10px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', animation: 'fadeIn 0.3s',
        }}>
          {syncMsg}
        </div>
      )}
    </>
  );
}
