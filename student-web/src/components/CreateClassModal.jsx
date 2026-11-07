import { useState } from 'react';
import { api } from '../api';

const GRADE_OPTIONS = [
  { value: 'P1', label: 'P1 — Primary 1' },
  { value: 'P2', label: 'P2 — Primary 2' },
  { value: 'P3', label: 'P3 — Primary 3' },
  { value: 'P4', label: 'P4 — Primary 4' },
  { value: 'P5', label: 'P5 — Primary 5' },
  { value: 'P6', label: 'P6 — Primary 6' },
  { value: 'S1', label: 'S1 — Senior 1' },
  { value: 'S2', label: 'S2 — Senior 2' },
  { value: 'S3', label: 'S3 — Senior 3' },
  { value: 'S4', label: 'S4 — Senior 4' },
  { value: 'S5', label: 'S5 — Senior 5' },
  { value: 'S6', label: 'S6 — Senior 6' },
];

const SUBJECTS = [
  'English', 'Mathematics', 'Kinyarwanda', 'French', 'Science and Elementary Technology (SET)',
  'Social and Religious Studies (SST)', 'Creative Arts', 'Physical Education and Sports (PES)',
  'ICT', 'Entrepreneurship', 'Biology', 'Chemistry', 'Physics', 'Geography', 'History',
  'Economics', 'Accounting', 'Literature in English', 'Kinyarwanda Literature', 'Religious Education',
  'General Studies', 'Other',
];

export default function CreateClassModal({ token, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', grade: '', subjects: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleSubject = (subj) => {
    setForm(prev => {
      const has = prev.subjects.includes(subj);
      return {
        ...prev,
        subjects: has ? prev.subjects.filter(s => s !== subj) : [...prev.subjects, subj],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.grade) { setError('Please select a grade.'); return; }
    if (form.subjects.length === 0) { setError('Please select at least one subject.'); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        grade: form.grade,
        subjects: form.subjects,
        subject: form.subjects.join(', '),
      };
      await api.post('/classes', payload, token);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>📚 Create New Class</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Class Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. S3 Mathematics"
              required
            />
          </div>
          <div className="form-group">
            <label>Grade *</label>
            <select
              value={form.grade}
              onChange={e => setForm({ ...form, grade: e.target.value })}
            >
              <option value="">— Choose grade —</option>
              {GRADE_OPTIONS.map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Subjects * <span style={{ fontWeight: 400, fontSize: 12, color: '#64748b' }}>(select one or more)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {SUBJECTS.map(s => {
                const selected = form.subjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSubject(s)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: selected ? '2px solid #667eea' : '2px solid #e2e8f0',
                      background: selected ? '#667eea' : '#f8fafc',
                      color: selected ? '#fff' : '#475569',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {selected ? '✓ ' : ''}{s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
