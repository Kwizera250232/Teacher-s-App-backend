import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import '../pages/Dashboard.css';
import './StudentNotes.css';

const NOTE_COLORS = [
  '#fff9c4', '#f8bbd0', '#c8e6c9', '#bbdefb', '#ffe0b2',
  '#e1bee7', '#b2ebf2', '#f0f4c3', '#ffffff', '#fce4ec',
];

const BADGE_META = {
  perfect_score: { icon: '💯', label: 'Perfect Score',    color: '#f39c12' },
  excellence:    { icon: '⭐', label: 'Excellence',       color: '#9b59b6' },
  great_job:     { icon: '🏅', label: 'Great Job',        color: '#27ae60' },
  top_student:   { icon: '🏆', label: 'Umunyeshuri #1',   color: '#e74c3c' },
  keep_going:    { icon: '💪', label: 'Komeza Wihatire',  color: '#3498db' },
};

export default function StudentNotes() {
  const { token } = useAuth();
  const [notes, setNotes] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', color: NOTE_COLORS[0] });
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const titleRef = useRef();

  async function load() {
    setLoading(true);
    try {
      const [n, b] = await Promise.all([
        api.get('/student/notes', token),
        api.get('/classes/my-badges', token).catch(() => []),
      ]);
      setNotes(Array.isArray(n) ? n : []);
      setBadges(Array.isArray(b) ? b : []);
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (showForm && titleRef.current) titleRef.current.focus(); }, [showForm]);

  function openNew() {
    setEditNote(null);
    setForm({ title: '', content: '', color: NOTE_COLORS[0] });
    setShowForm(true);
  }

  function openEdit(note) {
    setEditNote(note);
    setForm({ title: note.title, content: note.content || '', color: note.color || NOTE_COLORS[0] });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editNote) {
        await api.put(`/student/notes/${editNote.id}`, { ...form, pinned: editNote.pinned }, token);
      } else {
        await api.post('/student/notes', form, token);
      }
      setShowForm(false);
      await load();
    } catch (_) {}
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Siba iyi noti?')) return;
    try {
      await api.delete(`/student/notes/${id}`, token);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (_) {}
  }

  async function togglePin(note) {
    try {
      await api.put(`/student/notes/${note.id}`, { ...note, pinned: !note.pinned }, token);
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n)
        .sort((a,b) => b.pinned - a.pinned || new Date(b.updated_at) - new Date(a.updated_at)));
    } catch (_) {}
  }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(searchQ.toLowerCase()) ||
    (n.content || '').toLowerCase().includes(searchQ.toLowerCase())
  );
  const pinned = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  return (
    <div className="sn-page">
      <div className="sn-header">
        <div className="sn-header-left">
          <Link to="/student/dashboard" className="btn btn-outline btn-sm">← Inyuma</Link>
          <h1 className="sn-title">📝 My Notes</h1>
        </div>
        <div className="sn-header-right">
          <input
            className="sn-search"
            placeholder="Shakisha amateka..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          <button className="btn btn-primary" onClick={openNew}>+ Noti Nshya</button>
        </div>
      </div>

      {/* Badges section */}
      {badges.length > 0 && (
        <div className="sn-badges-section">
          <h3 className="sn-section-label">🏆 Ibimpamyabukuri Byanjye</h3>
          <div className="sn-badges">
            {badges.slice(0, 12).map(b => {
              const meta = BADGE_META[b.badge] || { icon: '🎖️', label: b.badge, color: '#888' };
              return (
                <div className="sn-badge" key={b.id} style={{ borderColor: meta.color }}>
                  <span className="sn-badge-icon">{meta.icon}</span>
                  <span className="sn-badge-label">{meta.label}</span>
                  {b.quiz_title && <span className="sn-badge-quiz">{b.quiz_title}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="sn-loading">Gutegereza...</div>
      ) : (
        <>
          {notes.length === 0 && (
            <div className="sn-empty">
              <div className="sn-empty-icon">📓</div>
              <p>Nta mateka ufite ubu. Kanda <strong>"+ Noti Nshya"</strong> gutangira!</p>
            </div>
          )}

          {pinned.length > 0 && (
            <>
              <p className="sn-section-label">📌 Ibyatinze</p>
              <div className="sn-grid">
                {pinned.map(note => <NoteCard key={note.id} note={note} onEdit={openEdit} onDelete={handleDelete} onPin={togglePin} />)}
              </div>
            </>
          )}
          {unpinned.length > 0 && (
            <>
              {pinned.length > 0 && <p className="sn-section-label">Izindi</p>}
              <div className="sn-grid">
                {unpinned.map(note => <NoteCard key={note.id} note={note} onEdit={openEdit} onDelete={handleDelete} onPin={togglePin} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* Modal */}
      {showForm && (
        <div className="sn-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <form className="sn-modal" onSubmit={handleSave}>
            <h2>{editNote ? 'Hindura Noti' : 'Noti Nshya'}</h2>
            <div className="form-group">
              <label>Insanganyamatsiko</label>
              <input
                ref={titleRef}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Andika insanganyamatsiko..."
                required
              />
            </div>
            <div className="form-group">
              <label>Ibintu</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Andika ikintu cyose wifuza..."
                rows={6}
              />
            </div>
            <div className="form-group">
              <label>Iranga Rangi</label>
              <div className="sn-color-picker">
                {NOTE_COLORS.map(c => (
                  <button
                    key={c} type="button"
                    className={`sn-color-swatch${form.color === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>
            <div className="sn-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Reka</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Bika...' : 'Bika Noti'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onEdit, onDelete, onPin }) {
  const date = new Date(note.updated_at).toLocaleDateString('rw-RW', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="sn-note" style={{ background: note.color || '#fff9c4' }}>
      {note.pinned && <span className="sn-pin-indicator">📌</span>}
      <h4 className="sn-note-title">{note.title}</h4>
      {note.content && <p className="sn-note-body">{note.content}</p>}
      <div className="sn-note-footer">
        <span className="sn-note-date">{date}</span>
        <div className="sn-note-actions">
          <button title={note.pinned ? 'Tangura' : 'Tanya'} onClick={() => onPin(note)}>{note.pinned ? '📌' : '📍'}</button>
          <button title="Hindura" onClick={() => onEdit(note)}>✏️</button>
          <button title="Siba" onClick={() => onDelete(note.id)}>🗑️</button>
        </div>
      </div>
    </div>
  );
}
