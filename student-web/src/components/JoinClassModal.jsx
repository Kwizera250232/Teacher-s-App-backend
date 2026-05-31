import { useState } from 'react';
import { api } from '../api';

export default function JoinClassModal({ token, onClose, onJoined }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/classes/join', { class_code: code.trim().toUpperCase() }, token);
      onJoined();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>🔑 Join a Class</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
          Enter the 6-character class code given by your teacher.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Class Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. X7P9Q2"
              maxLength={6}
              style={{ fontSize: '22px', letterSpacing: '6px', textAlign: 'center', fontWeight: '700' }}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || code.length < 6}>
              {loading ? 'Joining...' : 'Join Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
