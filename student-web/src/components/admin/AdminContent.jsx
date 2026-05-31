import { useState, useEffect } from 'react';
import { api } from '../../api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminContent({ token }) {
  const [tab, setTab] = useState('notes');
  const [data, setData] = useState({ notes: [], homework: [], quizzes: [] });

  const load = () => api.get('/admin/content', token).then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const delNote = async (id) => {
    await fetch(`${BASE}/admin/content/notes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  return (
    <div className="admin-card">
      <div className="admin-section-header">
        <h2 className="admin-section-title">📝 Content</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['notes', 'homework', 'quizzes'].map(t => (
            <button key={t} className={`btn-sm ${tab === t ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)} ({data[t]?.length || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="admin-table-wrap">
        {tab === 'notes' && (
          <table className="admin-table">
            <thead><tr><th>Title</th><th>File</th><th>Class</th><th>Teacher</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>
              {data.notes.length === 0 && <tr><td colSpan={6} className="empty-text">No notes.</td></tr>}
              {data.notes.map(n => (
                <tr key={n.id}>
                  <td><strong>{n.title}</strong></td>
                  <td>{n.file_name || '—'}</td>
                  <td>{n.class_name}</td>
                  <td>{n.teacher_name}</td>
                  <td>{new Date(n.created_at).toLocaleDateString()}</td>
                  <td><button className="btn-sm btn-danger" onClick={() => delNote(n.id)}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'homework' && (
          <table className="admin-table">
            <thead><tr><th>Title</th><th>Class</th><th>Teacher</th><th>Due Date</th><th>Created</th></tr></thead>
            <tbody>
              {data.homework.length === 0 && <tr><td colSpan={5} className="empty-text">No homework.</td></tr>}
              {data.homework.map(h => (
                <tr key={h.id}>
                  <td><strong>{h.title}</strong></td>
                  <td>{h.class_name}</td>
                  <td>{h.teacher_name}</td>
                  <td>{h.due_date ? new Date(h.due_date).toLocaleDateString() : '—'}</td>
                  <td>{new Date(h.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'quizzes' && (
          <table className="admin-table">
            <thead><tr><th>Title</th><th>Class</th><th>Teacher</th><th>Attempts</th><th>Created</th></tr></thead>
            <tbody>
              {data.quizzes.length === 0 && <tr><td colSpan={5} className="empty-text">No quizzes.</td></tr>}
              {data.quizzes.map(q => (
                <tr key={q.id}>
                  <td><strong>{q.title}</strong></td>
                  <td>{q.class_name}</td>
                  <td>{q.teacher_name}</td>
                  <td><span className="badge badge-blue">{q.attempt_count}</span></td>
                  <td>{new Date(q.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
