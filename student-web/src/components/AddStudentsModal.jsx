import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function AddStudentsModal({ token, onClose, onNeedJoinSchool }) {
  const { user, updateUser } = useAuth();
  const [linkedSchoolId, setLinkedSchoolId] = useState(
    user?.school_id != null ? String(user.school_id) : ''
  );
  const [schoolProfileLoaded, setSchoolProfileLoaded] = useState(false);
  const teacherNeedsSchool = user?.role === 'teacher' && schoolProfileLoaded && !linkedSchoolId;
  const canPickSchool = !linkedSchoolId || user?.role === 'admin';
  const [mode, setMode] = useState('single');
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState(
    user?.school_id != null ? String(user.school_id) : ''
  );
  const [linkedSchoolName, setLinkedSchoolName] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [showNewSchool, setShowNewSchool] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [bulkNames, setBulkNames] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');

  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let activeSchoolId = user?.school_id != null ? String(user.school_id) : '';
      try {
        const me = await api.get('/auth/me', token);
        const sid = me?.user?.school_id;
        if (!cancelled && sid != null) {
          activeSchoolId = String(sid);
          setLinkedSchoolId(activeSchoolId);
          setSchoolId(activeSchoolId);
          if (user && String(user.school_id || '') !== activeSchoolId) {
            updateUser({ ...user, school_id: sid });
          }
        }
      } catch {
        /* keep local user school_id if /me fails */
      } finally {
        if (!cancelled) setSchoolProfileLoaded(true);
      }
      try {
        const data = await api.get('/auth/schools', token);
        if (cancelled) return;
        setSchools(Array.isArray(data) ? data : []);
        if (activeSchoolId) {
          const mySchool = data.find((s) => String(s.id) === activeSchoolId);
          if (mySchool) setLinkedSchoolName(mySchool.name);
        }
      } catch {
        if (!cancelled) setSchools([]);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const created = await api.post('/auth/schools', { name: newSchoolName.trim() }, token);
      setSchools(prev => [...prev, created]);
      const newId = String(created.id);
      setSchoolId(newId);
      if (!linkedSchoolId) setLinkedSchoolName(created.name || newSchoolName.trim());
      setShowNewSchool(false);
      setNewSchoolName('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSingle = async () => {
    if (!name.trim()) return setError('Student name is required.');
    if (!schoolId) return setError('Please select a school.');
    setLoading(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        role: 'student',
        school_id: schoolId,
      };
      if (email.trim()) body.email = email.trim();
      if (password.trim()) body.password = password.trim();
      const res = await api.post('/admin/add-pupil', body, token);
      setResults({ type: 'single', data: res });
      setName('');
      setEmail('');
      setPassword('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBulk = async () => {
    if (!bulkNames.trim()) return setError('Enter at least one student name.');
    if (!schoolId) return setError('Please select a school.');
    setLoading(true);
    setError('');
    try {
      const body = {
        names: bulkNames,
        role: 'student',
        school_id: schoolId,
      };
      if (bulkPassword.trim()) body.password = bulkPassword.trim();
      const res = await api.post('/admin/add-pupils', body, token);
      setResults({ type: 'bulk', data: res });
      setBulkNames('');
      setBulkPassword('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>Add Students</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            className={`btn ${mode === 'single' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => { setMode('single'); setResults(null); setError(''); }}
          >
            Single Student
          </button>
          <button
            className={`btn ${mode === 'bulk' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            onClick={() => { setMode('bulk'); setResults(null); setError(''); }}
          >
            Many Students
          </button>
        </div>

        {teacherNeedsSchool && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            Your account is not linked to a school yet. Join a school from the dashboard first — your Head Teacher must approve before you can add students.
            {onNeedJoinSchool && (
              <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => { onClose(); onNeedJoinSchool(); }}>
                Join a school
              </button>
            )}
          </div>
        )}

        {/* School selection */}
        {!teacherNeedsSchool && (
        <div className="form-group">
          <label style={{ fontSize: 14, fontWeight: 600 }}>
            School *
            {linkedSchoolId && linkedSchoolName && (
              <span style={{ fontWeight: 400, color: '#16a34a', marginLeft: 8, fontSize: 12 }}>
                (Your school: {linkedSchoolName})
              </span>
            )}
          </label>
          {linkedSchoolId && !canPickSchool ? (
            <input
              readOnly
              value={linkedSchoolName || 'Your school'}
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, background: '#f8fafc' }}
            />
          ) : !showNewSchool ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ flex: 1, padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, background: 'white' }}
                value={schoolId}
                onChange={e => setSchoolId(e.target.value)}
              >
                <option value="">Select School</option>
                {schools.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewSchool(true)}
                title="Add new school"
              >
                + New
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ flex: 1, padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                placeholder="Enter new school name"
                value={newSchoolName}
                onChange={e => setNewSchoolName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateSchool()}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleCreateSchool}
                disabled={loading}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => { setShowNewSchool(false); setNewSchoolName(''); }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {/* Single student form */}
        {mode === 'single' && !results && !teacherNeedsSchool && (
          <div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600 }}>Full Name *</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter student full name"
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600 }}>Email (optional)</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@school.edu (auto-generated if empty)"
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600 }}>Password (optional)</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Leave empty for auto-generated password"
              />
              <small style={{ color: '#64748b', fontSize: 12 }}>
                If left empty, a random password will be generated.
              </small>
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={handleAddSingle}
              disabled={loading}
            >
              {loading ? 'Creating...' : '+ Add Student'}
            </button>
          </div>
        )}

        {/* Bulk student form */}
        {mode === 'bulk' && !results && !teacherNeedsSchool && (
          <div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600 }}>Student Names (one per line) *</label>
              <textarea
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, minHeight: 120, resize: 'vertical' }}
                value={bulkNames}
                onChange={e => setBulkNames(e.target.value)}
                placeholder={"Jean Mugisha\nMarie Uwimana\nPierre Habimana"}
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600 }}>Password for all students (optional)</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                value={bulkPassword}
                onChange={e => setBulkPassword(e.target.value)}
                placeholder="Same password for all students (leave empty for random)"
              />
              <small style={{ color: '#64748b', fontSize: 12 }}>
                All students will get this password. If empty, each gets a unique random password.
              </small>
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={handleAddBulk}
              disabled={loading}
            >
              {loading ? 'Creating...' : '+ Add All Students'}
            </button>
          </div>
        )}

        {/* Results - single */}
        {results?.type === 'single' && (
          <div style={{ padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 }}>
            <h3 style={{ color: '#166534', fontSize: 16, marginBottom: 12 }}>Student Created!</h3>
            <div style={{ background: 'white', padding: 12, borderRadius: 8, fontSize: 14 }}>
              <div><strong>Name:</strong> {results.data.user.name}</div>
              <div><strong>Email:</strong> {results.data.user.email}</div>
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 6 }}>
                <strong>Password:</strong>{' '}
                <code style={{ fontSize: 15, fontWeight: 700, color: '#9a3412' }}>
                  {results.data.temp_password}
                </code>
              </div>
              <small style={{ color: '#64748b', display: 'block', marginTop: 8 }}>
                Share these credentials with the student securely.
              </small>
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setResults(null)}
            >
              + Add Another
            </button>
          </div>
        )}

        {/* Results - bulk */}
        {results?.type === 'bulk' && (
          <div style={{ padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 }}>
            <h3 style={{ color: '#166534', fontSize: 16, marginBottom: 12 }}>
              {results.data.created.length} Student(s) Created!
            </h3>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {results.data.created.map((item, i) => (
                <div key={i} style={{ background: 'white', padding: 10, borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                  <div><strong>{item.user.name}</strong></div>
                  <div style={{ color: '#64748b' }}>{item.user.email}</div>
                  <div>
                    Password: <code style={{ fontWeight: 700, color: '#9a3412' }}>{item.temp_password}</code>
                  </div>
                </div>
              ))}
              {results.data.failed?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <h4 style={{ color: '#dc2626', fontSize: 14 }}>Failed ({results.data.failed.length}):</h4>
                  {results.data.failed.map((f, i) => (
                    <div key={i} style={{ background: '#fff0f0', padding: 8, borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                      {f.name}: {f.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setResults(null)}
            >
              + Add More
            </button>
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
