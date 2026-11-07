import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';

export default function AddSchoolModal({ token, onClose, onDone }) {
  const [schools, setSchools] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    api.get('/auth/schools', token).then((d) => setSchools(Array.isArray(d) ? d : [])).catch(() => {});
    api.get('/admin/my-school-request', token).then((r) => { if (r) setPending(r); }).catch(() => {});
  }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [schools, search]);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      let schoolId = selected;
      if (showNew) {
        if (!newName.trim()) { setError('Write your school name.'); setLoading(false); return; }
        const created = await api.post('/auth/schools', { name: newName.trim() }, token);
        schoolId = String(created.id);
      }
      if (!schoolId) { setError('Pick a school or write a new one.'); setLoading(false); return; }
      const res = await api.post('/admin/request-school', { school_id: schoolId }, token);
      setPending(res.request);
      setDone(res.message || 'Request sent! Waiting for the school admin to approve.');
      if (onDone) setTimeout(onDone, 1800);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>🏫 Add School</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {done ? (
          <div style={{ padding: '16px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🏫</div>
            <p style={{ color: '#166534', fontWeight: 700 }}>{done}</p>
          </div>
        ) : pending?.status === 'pending' ? (
          <div style={{ padding: '16px 4px', textAlign: 'center' }}>
            <p style={{ color: '#92400e', fontWeight: 700 }}>Your request to join <strong>{pending.school_name}</strong> is waiting for approval.</p>
          </div>
        ) : pending?.status === 'approved' ? (
          <div style={{ padding: '16px 4px', textAlign: 'center' }}>
            <p style={{ color: '#166534', fontWeight: 700 }}>You are linked to <strong>{pending.school_name}</strong>.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, color: '#475569', marginBottom: 14 }}>
              Pick your school from the list, or write a new one. The school admin approves your request.
            </p>
            {!showNew && (
              <>
                <input
                  style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, marginBottom: 10, color: '#1e293b' }}
                  placeholder="Search school…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 8, marginBottom: 12 }}>
                  {filtered.length === 0 && <p style={{ padding: 14, color: '#94a3b8', fontSize: 13, margin: 0 }}>No schools found.</p>}
                  {filtered.map((s) => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 14 }}>
                      <input type="radio" name="school" checked={selected === String(s.id)} onChange={() => { setSelected(String(s.id)); setShowNew(false); }} />
                      {s.name}
                    </label>
                  ))}
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setShowNew(true); setSelected(''); }} style={{ marginBottom: 12 }}>
                  + Write a new school name
                </button>
              </>
            )}
            {showNew && (
              <div className="form-group">
                <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>New school name *</label>
                <input
                  style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, color: '#1e293b' }}
                  placeholder="e.g. Groupe Scolaire Amahuriro"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowNew(false)} style={{ marginTop: 8 }}>← Back to list</button>
              </div>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            <button className="btn btn-primary btn-full" onClick={submit} disabled={loading}>
              {loading ? 'Sending…' : 'Request to join school'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
