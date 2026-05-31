import { useState, useEffect } from 'react';
import { api, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import ClassmateProfileModal from './ClassmateProfileModal';

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%2325d366'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

/** WhatsApp-style list of classmates across the student's classes. */
export default function StudentClassmatesList({ token, classes }) {
  const { user } = useAuth();
  const [mates, setMates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!classes?.length) {
      setMates([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const byId = new Map();
      await Promise.all(
        classes.map(async (cls) => {
          try {
            const rows = await api.get(`/classes/${cls.id}/classmates`, token);
            (rows || []).forEach((s) => {
              if (s.id === user?.id || s.role === 'teacher') return;
              const key = s.id;
              if (!byId.has(key)) {
                byId.set(key, {
                  id: s.id,
                  name: s.name,
                  role: s.role,
                  avatar_path: s.avatar_path,
                  class_name: cls.name,
                  class_id: cls.id,
                  subscriber_count: s.subscriber_count,
                });
              }
            });
          } catch {
            /* skip class */
          }
        })
      );
      if (!cancelled) {
        setMates([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classes, token, user?.id]);

  if (loading) return <p className="wa-section-hint">Loading classmates…</p>;
  if (!mates.length) return null;

  return (
    <section className="wa-chat-section">
      <div className="wa-section-title">Classmates</div>
      <div className="wa-class-list">
        {mates.map((m) => (
          <button
            key={m.id}
            type="button"
            className="wa-class-row wa-class-row--mate"
            onClick={() => setSelected({ id: m.id, name: m.name, role: m.role || 'student' })}
          >
            <div className="wa-class-avatar wa-class-avatar--mate">
              <img
                src={m.avatar_path ? `${UPLOADS_BASE}${m.avatar_path}` : DEFAULT_AVATAR}
                alt=""
              />
            </div>
            <div className="wa-class-body">
              <strong>{m.name}</strong>
              <span className="wa-preview">
                {m.class_name}
                {m.subscriber_count > 0 ? ` · ${m.subscriber_count} followers` : ' · Tap to view profile'}
              </span>
            </div>
            <span className="wa-class-time">›</span>
          </button>
        ))}
      </div>
      {selected && (
        <ClassmateProfileModal person={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
