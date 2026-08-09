import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ClassmateProfileModal from './ClassmateProfileModal';
import ClassmatesWaList from './ClassmatesWaList';

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
            const list = await api.get(`/classes/${cls.id}/classmates`, token);
            (list || []).forEach((s) => {
              if (s.id === user?.id) return;
              const key = s.id;
              if (!byId.has(key)) {
                byId.set(key, {
                  ...s,
                  class_name: cls.name,
                  class_id: cls.id,
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
    return () => { cancelled = true; };
  }, [classes, token, user?.id]);

  if (loading) return <p className="wa-section-hint">Loading classmates…</p>;
  if (!mates.length) return null;

  return (
    <section className="wa-chat-section">
      <div className="wa-section-title">Classmates</div>
      <ClassmatesWaList people={mates} onSelect={(m) => setSelected({ id: m.id, name: m.name, role: m.role || 'student' })} />
      {selected && (
        <ClassmateProfileModal
          person={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
