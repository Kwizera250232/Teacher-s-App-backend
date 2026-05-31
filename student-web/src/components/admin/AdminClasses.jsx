import { useState, useEffect } from 'react';
import { api } from '../../api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function AdminClasses({ token }) {
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState('');

  const load = () => api.get('/admin/classes', token).then(setClasses).catch(() => {});
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm('Delete this class and all its content?')) return;
    await fetch(`${BASE}/admin/classes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  const filtered = classes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.teacher_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-card">
      <div className="admin-section-header">
        <h2 className="admin-section-title">📚 Classes ({classes.length})</h2>
        <input className="admin-input" style={{ maxWidth: 240 }} placeholder="Search by class or teacher..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Class Name</th><th>Subject</th><th>Teacher</th><th>School</th><th>Code</th><th>Students</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="empty-text">No classes found.</td></tr>}
            {filtered.map(c => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.subject || '—'}</td>
                <td>{c.teacher_name}</td>
                <td>{c.school_name || '—'}</td>
                <td><span className="badge badge-blue" style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>{c.class_code}</span></td>
                <td>{c.student_count}</td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
                <td><button className="btn-sm btn-danger" onClick={() => del(c.id)}>🗑️ Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
