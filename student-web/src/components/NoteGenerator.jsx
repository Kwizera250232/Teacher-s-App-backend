import { useEffect, useRef, useState } from 'react';
import { api, API_BASE } from '../api';
import './NoteGenerator.css';

const LANGUAGES = ['English', 'Kinyarwanda', 'French'];
const NOTE_TYPES = [
  { id: 'brief', label: 'Brief revision notes' },
  { id: 'classroom', label: 'Complete classroom notes' },
  { id: 'detailed', label: 'Detailed notes with worked examples and activities' },
];

export default function NoteGenerator({ user, token }) {
  const [form, setForm] = useState({
    classLevel: '',
    subject: '',
    topic: '',
    language: 'English',
    noteType: 'classroom',
    planId: '',
  });
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [notesHtml, setNotesHtml] = useState('');
  const [notes, setNotes] = useState([]);
  const [viewNote, setViewNote] = useState(null);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState('');
  const editorRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    api.get('/teacher-notes', token).then(r => setNotes(r.notes || [])).catch(() => {});
    api.get('/teacher-notes/plans', token).then(r => setPlans(r.plans || [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (viewNote && previewRef.current) previewRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [viewNote]);

  const set = (f) => (e) => setForm(s => ({ ...s, [f]: e.target.value }));

  const applyPlan = (e) => {
    const p = plans.find(x => x.id === Number(e.target.value));
    setForm(s => ({ ...s, planId: e.target.value }));
    if (p) setForm(s => ({ ...s, planId: String(p.id), subject: p.subject || s.subject, classLevel: p.class_name || s.classLevel, topic: p.title || s.topic }));
  };

  const generate = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.subject.trim() || !form.topic.trim()) return setError('Subject and topic are required.');
    setGenerating(true);
    setViewNote(null);
    try {
      const r = await api.post('/teacher-notes/generate', {
        classLevel: form.classLevel,
        subject: form.subject,
        topic: form.topic,
        language: form.language,
        noteType: form.noteType,
        objectives: plans.find(p => String(p.id) === form.planId)
          ? `Explain and demonstrate ${form.topic} with accuracy and confidence` : undefined,
      }, token);
      if (r?.ai && r.html) {
        setNotesHtml(r.html);
        setEditing(false);
      } else {
        setError('AI could not write notes right now — try again.');
      }
    } catch {
      setError('AI could not write notes right now — try again.');
    }
    setGenerating(false);
  };

  const saveNotes = async () => {
    const html = editing && editorRef.current ? editorRef.current.innerHTML : notesHtml;
    if (!html) return;
    try {
      await api.post('/teacher-notes', {
        title: form.topic, subject: form.subject, class_name: form.classLevel,
        language: form.language, note_type: form.noteType, html,
      }, token);
      const r = await api.get('/teacher-notes', token);
      setNotes(r.notes || []);
      setError('');
      alert('Saved to My Resources.');
    } catch (e2) {
      setError(e2.message || 'Could not save.');
    }
  };

  const openNote = async (id) => {
    const n = await api.get(`/teacher-notes/${id}`, token).catch(() => null);
    if (n) { setViewNote(n); setNotesHtml(''); }
  };

  const removeNote = async (id) => {
    if (!confirm('Delete these notes?')) return;
    await api.delete(`/teacher-notes/${id}`, token);
    setNotes(ns => ns.filter(n => n.id !== id));
    if (viewNote?.id === id) setViewNote(null);
  };

  const download = async (mode, html, title, subject, className, language) => {
    setError('');
    setDownloading(mode);
    try {
      const res = await fetch(`${API_BASE}/teacher-notes/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ html, mode, title, subject, class_name: className, language }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Notes-${(title || 'notes').replace(/[^\w]+/g, '-')}.${mode === 'doc' ? 'doc' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setDownloading('');
    }
  };

  const currentHtml = () => (editing && editorRef.current ? editorRef.current.innerHTML : notesHtml);

  return (
    <div className="note-generator">
      <div className="ng-header">
        <h1>📓 Teaching Notes Generator</h1>
        <p>From curriculum topic to ready-to-teach material — AI writes it, you edit it, save it, and download it.</p>
      </div>

      {notes.length > 0 && (
        <div className="ng-saved">
          <h3>📁 My Resources ({notes.length})</h3>
          {notes.map(n => (
            <div key={n.id} className="ng-saved-row">
              <span className="ng-saved-meta">
                <strong>{n.title || 'Untitled'}</strong> — {n.subject} ({n.class_name}) · {n.language}
                <br /><small>{new Date(n.created_at).toLocaleString()}</small>
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="lp-btn lp-btn-primary" onClick={() => openNote(n.id)}>👁 View</button>
                <button type="button" className="lp-btn" onClick={() => removeNote(n.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewNote && (
        <div className="ng-result" ref={previewRef}>
          <div className="ng-result-header">
            <h2>{viewNote.title}</h2>
            <div className="ng-actions">
              <button type="button" className="lp-btn lp-btn-primary" disabled={!!downloading} onClick={() => download('doc', viewNote.html, viewNote.title, viewNote.subject, viewNote.class_name, viewNote.language)}>⬇️ Word</button>
              <button type="button" className="lp-btn lp-btn-primary" disabled={!!downloading} onClick={() => download('pdf', viewNote.html, viewNote.title, viewNote.subject, viewNote.class_name, viewNote.language)}>⬇️ PDF</button>
              <button type="button" className="lp-btn" onClick={() => setViewNote(null)}>✖ Close</button>
            </div>
          </div>
          <div className="ng-content" dangerouslySetInnerHTML={{ __html: viewNote.html }} />
        </div>
      )}

      <form className="ng-form" onSubmit={generate}>
        <div className="ng-grid">
          {plans.length > 0 && (
            <div className="ng-group ng-full">
              <label>📋 From a saved lesson plan (auto-fills subject, class, topic)</label>
              <select value={form.planId} onChange={applyPlan}>
                <option value="">— choose a lesson plan —</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.title} — {p.subject} ({p.class_name})</option>
                ))}
              </select>
            </div>
          )}
          <div className="ng-group">
            <label className="ng-required">Class level</label>
            <input value={form.classLevel} onChange={set('classLevel')} placeholder="e.g., Primary 6" required />
          </div>
          <div className="ng-group">
            <label className="ng-required">Subject</label>
            <input value={form.subject} onChange={set('subject')} placeholder="e.g., English" required />
          </div>
          <div className="ng-group ng-full">
            <label className="ng-required">Topic or unit</label>
            <input value={form.topic} onChange={set('topic')} placeholder="e.g., Talking about Weather" required />
          </div>
          <div className="ng-group">
            <label>Language of notes</label>
            <select value={form.language} onChange={set('language')}>
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="ng-group">
            <label>Type of notes</label>
            <select value={form.noteType} onChange={set('noteType')}>
              {NOTE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <button type="submit" className="lp-generate-btn" disabled={generating}>
          {generating ? '⏳ AI is writing your notes…' : '✨ Generate Teaching Notes'}
        </button>
      </form>

      {notesHtml && !viewNote && (
        <div className="ng-result">
          <div className="ng-result-header">
            <h2>📋 {form.topic}</h2>
            <div className="ng-actions">
              <button type="button" className="lp-btn" onClick={() => setEditing(e => !e)}>
                {editing ? '👁 Preview' : '✏️ Edit'}
              </button>
              <button type="button" className="lp-btn lp-btn-primary" onClick={saveNotes}>💾 Save to My Resources</button>
              <button type="button" className="lp-btn lp-btn-primary" disabled={!!downloading} onClick={() => download('doc', currentHtml(), form.topic, form.subject, form.classLevel, form.language)}>⬇️ Word</button>
              <button type="button" className="lp-btn lp-btn-primary" disabled={!!downloading} onClick={() => download('pdf', currentHtml(), form.topic, form.subject, form.classLevel, form.language)}>⬇️ PDF</button>
            </div>
          </div>
          {editing ? (
            <div ref={editorRef} className="ng-content ng-editing" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: notesHtml }} />
          ) : (
            <div className="ng-content" dangerouslySetInnerHTML={{ __html: notesHtml }} />
          )}
          {editing && <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>Editing mode — click into the text and change anything, then Save.</p>}
        </div>
      )}
    </div>
  );
}
