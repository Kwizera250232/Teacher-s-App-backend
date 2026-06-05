import { useEffect, useState } from 'react';
import { API_BASE } from '../api';

function apiHasLatestFeatures(health) {
  return Boolean(
    health?.features?.quiz_teacher_shares &&
    health?.features?.note_teacher_shares &&
    health?.features?.login_email_edu
  );
}

/** Warn when studentapi.umunsi.com is still on an old build (404 on new routes). */
export default function StaleApiBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const healthRes = await fetch(`${API_BASE}/health`);
        const health = healthRes.ok ? await healthRes.json() : null;
        if (apiHasLatestFeatures(health)) {
          if (!cancelled) setStale(false);
          return;
        }
        const [quizProbe, noteProbe] = await Promise.all([
          fetch(`${API_BASE}/quiz-teacher-shares/colleagues`),
          fetch(`${API_BASE}/note-teacher-shares/colleagues`),
        ]);
        if (!cancelled) {
          setStale(quizProbe.status === 404 || noteProbe.status === 404);
        }
      } catch {
        if (!cancelled) setStale(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!stale) return null;

  return (
    <div
      className="alert alert-error"
      style={{ marginBottom: 16, lineHeight: 1.5 }}
      role="alert"
    >
      <strong>API update needed.</strong>{' '}
      Quiz sharing with colleagues, note sharing, and student emails like{' '}
      <strong>name@brightschool.edu</strong> require the latest server on{' '}
      <code>studentapi.umunsi.com</code>. Ask your admin to run the Hostinger deploy script, then hard-refresh this page.
    </div>
  );
}
