import { useState } from 'react';
import { api } from '../../api';

export default function WeeklyDigestModal({ token, classId, onClose, onSent }) {
  const [behavior, setBehavior] = useState('');
  const [work, setWork] = useState('');
  const [attendance, setAttendance] = useState('');
  const [gaps, setGaps] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMsg('');
    try {
      const r = await api.post(`/parent/classes/${classId}/weekly-digest`, {
        behavior_note: behavior.trim(),
        work_summary: work.trim(),
        attendance: attendance.trim(),
        gaps: gaps.trim(),
      }, token);
      setMsg(r.message || 'Weekly digest sent to parents in the app.');
      onSent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2>Weekly parent update</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          Saved for records and sent as an in-app notification to linked parents.
        </p>
        <form onSubmit={submit}>
          <label className="form-group">
            Behavior
            <textarea rows={2} value={behavior} onChange={(e) => setBehavior(e.target.value)} required />
          </label>
          <label className="form-group">
            Work summary
            <textarea rows={2} value={work} onChange={(e) => setWork(e.target.value)} required />
          </label>
          <label className="form-group">
            Attendance
            <input value={attendance} onChange={(e) => setAttendance(e.target.value)} required />
          </label>
          <label className="form-group">
            Gaps / next steps
            <textarea rows={2} value={gaps} onChange={(e) => setGaps(e.target.value)} />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          {msg && <div className="alert alert-success">{msg}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending…' : 'Send to parents'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
