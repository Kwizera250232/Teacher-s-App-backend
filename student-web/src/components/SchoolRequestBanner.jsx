import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function SchoolRequestBanner({ token, user }) {
  const { updateUser } = useAuth();
  const [pendingRequest, setPendingRequest] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [schools, setSchools] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [showNewSchool, setShowNewSchool] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/admin/my-school-request', token).then(data => {
      if (data) setPendingRequest(data);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!pendingRequest || pendingRequest.status !== 'pending' || user?.school_id) return undefined;
    const t = setInterval(() => {
      api.get('/auth/me', token).then((r) => {
        if (r.user?.school_id) updateUser(r.user);
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [pendingRequest, token, user?.school_id, updateUser]);

  useEffect(() => {
    if (showModal) {
      api.get('/auth/schools', token).then(setSchools).catch(() => {});
    }
  }, [showModal, token]);

  if (user?.role !== 'teacher') return null;
  if (user?.school_id) return null;

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const created = await api.post('/auth/schools', { name: newSchoolName.trim() }, token);
      setSchools(prev => [...prev, created]);
      setSelectedSchool(String(created.id));
      setShowNewSchool(false);
      setNewSchoolName('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedSchool) return setError('Please select a school.');
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/admin/request-school', {
        school_id: selectedSchool,
        message: message.trim() || null,
      }, token);
      setSuccess(res.message);
      setPendingRequest(res.request);
      setTimeout(() => setShowModal(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredSchools = search.trim()
    ? schools.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : schools;

  if (pendingRequest?.status === 'pending') {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
        border: '1px solid #f59e0b',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 24 }}>⏳</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#92400e' }}>School Request Pending</strong>
          <p style={{ margin: '4px 0 0', color: '#78350f', fontSize: 14 }}>
            Your request to join <strong>{pendingRequest.school_name}</strong> is waiting for approval from the Head Teacher or Admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        id="school-join-banner"
        style={{
        background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
        border: '1px solid #3b82f6',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 24 }}>🏫</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#1e40af' }}>No School Assigned</strong>
          <p style={{ margin: '4px 0 0', color: '#1e3a5f', fontSize: 14 }}>
            Join a school to add students and manage your classes. Choose your school and tap Join — your Head Teacher will approve.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          🏫 Join a School
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2>Join a School</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
              Search for your school or add a new one. The Head Teacher or Admin will approve your request.
            </p>

            {!showNewSchool ? (
              <>
                <div className="form-group">
                  <label style={{ fontSize: 14, fontWeight: 600 }}>Search School</label>
                  <input
                    style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                    placeholder="Type school name to search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>

                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  {filteredSchools.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                      {search ? 'No schools found. Try adding a new one.' : 'Loading schools...'}
                    </div>
                  ) : filteredSchools.map(s => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSchool(String(s.id))}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9',
                        background: selectedSchool === String(s.id) ? '#eff6ff' : 'white',
                        fontWeight: selectedSchool === String(s.id) ? 600 : 400,
                        color: selectedSchool === String(s.id) ? '#1e40af' : '#374151',
                        fontSize: 14,
                      }}
                    >
                      {selectedSchool === String(s.id) && '✓ '}{s.name}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginBottom: 16 }}
                  onClick={() => setShowNewSchool(true)}
                >
                  + Add New School
                </button>
              </>
            ) : (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 14, fontWeight: 600 }}>New School Name</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ flex: 1, padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                    placeholder="Enter new school name"
                    value={newSchoolName}
                    onChange={e => setNewSchoolName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateSchool()}
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleCreateSchool} disabled={loading}>Add</button>
                  <button className="btn btn-outline btn-sm" onClick={() => { setShowNewSchool(false); setNewSchoolName(''); }}>Cancel</button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600 }}>Message (optional)</label>
              <textarea
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, minHeight: 60, resize: 'vertical' }}
                placeholder="Why you want to join this school..."
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmitRequest} disabled={loading || !selectedSchool}>
                {loading ? 'Sending...' : 'Join school'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
