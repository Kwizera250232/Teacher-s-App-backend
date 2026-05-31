import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const SUBJECTS = ['Mathematics', 'English', 'Kinyarwanda', 'French', 'SST', 'SET', 'Creative Arts', 'PES'];
const GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const TYPES = ['PB', 'TG'];

export default function AdminTextbooks({ token }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', subject: 'Mathematics', grade_level: 'P1', book_type: 'PB' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    fetch(`${API_BASE}/textbooks`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setBooks).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Hitamo PDF file.'); return; }
    setUploading(true);
    setError('');
    const fd = new FormData();
    fd.append('title', form.title || `${form.grade_level} ${form.subject} ${form.book_type}`);
    fd.append('subject', form.subject);
    fd.append('grade_level', form.grade_level);
    fd.append('book_type', form.book_type);
    fd.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/textbooks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setSuccess(`"${data.title}" yashyizweho neza!`);
      setTimeout(() => setSuccess(''), 4000);
      setShowForm(false);
      setFile(null);
      setForm({ title: '', subject: 'Mathematics', grade_level: 'P1', book_type: 'PB' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/textbooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Group books by grade
  const byGrade = books.reduce((acc, b) => {
    acc[b.grade_level] = acc[b.grade_level] || [];
    acc[b.grade_level].push(b);
    return acc;
  }, {});

  return (
    <div className="admin-card">
      <div className="admin-section-header">
        <h2 className="admin-section-title">🤖 Baza Umunsi Student AI — Ibitabo</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>
          {showForm ? '✕ Funga' : '+ Shyiraho Igitabo'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}

      {/* Upload form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: '#f8fafc', border: '1.5px dashed #c7d2fe', borderRadius: 12,
          padding: '18px 20px', marginBottom: 20,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Icyiciro</label>
              <select value={form.grade_level} onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Isomo</label>
              <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Ubwoko</label>
              <select value={form.book_type} onChange={e => setForm(f => ({ ...f, book_type: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
                {TYPES.map(t => <option key={t} value={t}>{t === 'PB' ? 'PB — Pupil Book' : 'TG — Teacher Guide'}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Amazina y'igitabo (optional — auto-filled)
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={`${form.grade_level} ${form.subject} ${form.book_type}`}
              style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              📄 Shyiraho PDF (max 50MB)
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={e => setFile(e.target.files[0])}
              required
              style={{ fontSize: 14 }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={uploading}>
            {uploading ? '⏳ Gushyiraho...' : '📤 Shyiraho Igitabo'}
          </button>
          {uploading && (
            <p style={{ fontSize: 12, color: '#6366f1', marginTop: 8 }}>
              Gusoma inyandiko z'igitabo... bishobora gufata iminota mike.
            </p>
          )}
        </form>
      )}

      {/* Book list grouped by grade */}
      {books.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <p>Nta bitabo byashyizweho. Shyiraho ibitabo kugira ngo Baza Umunsi Student AI ibe n'ubumenyi.</p>
        </div>
      ) : (
        Object.keys(byGrade).sort().map(grade => (
          <div key={grade} style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#4f46e5', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              📘 {grade}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {byGrade[grade].map(b => (
                <div key={b.id} style={{
                  background: b.book_type === 'PB' ? '#eff6ff' : '#f0fdf4',
                  border: `1.5px solid ${b.book_type === 'PB' ? '#bfdbfe' : '#bbf7d0'}`,
                  borderRadius: 10, padding: '10px 14px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', marginBottom: 2 }}>
                      {b.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      <span style={{
                        background: b.book_type === 'PB' ? '#dbeafe' : '#dcfce7',
                        color: b.book_type === 'PB' ? '#1d4ed8' : '#15803d',
                        borderRadius: 4, padding: '1px 6px', fontWeight: 600, marginRight: 4,
                      }}>{b.book_type}</span>
                      {b.subject}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                      {new Date(b.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(b.id, b.title)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: 0, flexShrink: 0 }}
                    title="Siba igitabo"
                  >🗑️</button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
