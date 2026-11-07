import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { signupEmailDomain } from '../utils/schoolDomain';

export default function AddStudentsModal({ token, onClose, onNeedJoinSchool }) {
  const { user, updateUser } = useAuth();
  const [linkedSchoolId, setLinkedSchoolId] = useState(
    user?.school_id != null ? String(user.school_id) : ''
  );
  const [schoolProfileLoaded, setSchoolProfileLoaded] = useState(false);
  const teacherNoSchool = user?.role === 'teacher' && schoolProfileLoaded && !linkedSchoolId;
  const teacherNeedsSchool = teacherNoSchool;
  const [mode, setMode] = useState('single');
  const [schoolId, setSchoolId] = useState(
    user?.school_id != null ? String(user.school_id) : ''
  );
  const [linkedSchoolName, setLinkedSchoolName] = useState('');
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [bulkNames, setBulkNames] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');

  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  // Class selection for immediate join
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [addClassTo, setAddClassTo] = useState(''); // '' = none, 'select' = pick from list

  const studentEmailDomain = signupEmailDomain(linkedSchoolName ? { name: linkedSchoolName } : null);

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
        if (activeSchoolId) {
          const mySchool = (Array.isArray(data) ? data : []).find((s) => String(s.id) === activeSchoolId);
          if (mySchool) setLinkedSchoolName(mySchool.name);
        }
      } catch {
        /* school name is cosmetic */
      }
      // Fetch teacher's classes for immediate-add option
      try {
        const classesData = await api.get('/classes', token);
        if (!cancelled && Array.isArray(classesData)) {
          setTeacherClasses(classesData);
        }
      } catch {
        // ignore — class selection is optional
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleAddSingle = async () => {
    if (!name.trim()) return setError('Student name is required.');
    if (!schoolId) return setError('Please select a school.');
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && studentEmailDomain) {
      if (trimmedEmail.includes('mail.umunsi.com')) {
        return setError(`Use @${studentEmailDomain} for students (e.g. name@${studentEmailDomain}), not @mail.umunsi.com.`);
      }
      if (!trimmedEmail.endsWith(`@${studentEmailDomain}`)) {
        return setError(`Email must end with @${studentEmailDomain}.`);
      }
    }
    setLoading(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        role: 'student',
        school_id: schoolId,
      };
      if (trimmedEmail) body.email = trimmedEmail;
      if (password.trim()) body.password = password.trim();
      const res = await api.post('/admin/add-pupil', body, token);
      // If teacher selected a class, add student to it immediately
      if (addClassTo && res?.user?.id) {
        try {
          await api.post(`/classes/${addClassTo}/join`, { student_id: res.user.id }, token);
        } catch (joinErr) {
          // Student created but class join failed — show partial success
          setResults({ type: 'single', data: res, joinWarning: `Student created but could not add to class: ${joinErr.message}` });
          setName(''); setEmail(''); setPassword('');
          setLoading(false);
          return;
        }
      }
      setResults({ type: 'single', data: res, addedToClass: addClassTo ? teacherClasses.find(c => String(c.id) === String(addClassTo))?.name : null });
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
      // If teacher selected a class, add all created students to it
      let joinedCount = 0;
      let joinFailures = 0;
      if (addClassTo && res?.created) {
        for (const item of res.created) {
          if (item?.user?.id) {
            try {
              await api.post(`/classes/${addClassTo}/join`, { student_id: item.user.id }, token);
              joinedCount++;
            } catch {
              joinFailures++;
            }
          }
        }
      }
      setResults({
        type: 'bulk',
        data: res,
        addedToClass: addClassTo ? teacherClasses.find(c => String(c.id) === String(addClassTo))?.name : null,
        joinedCount,
        joinFailures,
      });
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

        {teacherNoSchool && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, color: '#1e3a8a', fontSize: 14 }}>
            You need a school first. Close this and tap <strong>🏫 Add School</strong> on your dashboard — pick your school or write a new one.
          </div>
        )}

        {linkedSchoolName && (
          <div className="form-group">
            <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>School</label>
            <input
              readOnly
              value={linkedSchoolName}
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, background: '#f8fafc', color: '#1e293b' }}
            />
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {/* Class selection for immediate add */}
        {!teacherNeedsSchool && teacherClasses.length > 0 && !results && (
          <div className="form-group">
            <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
              Add to class immediately?
              <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 8, fontSize: 12 }}>
                (Optional — skip class code)
              </span>
            </label>
            <select
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, background: 'white', color: '#1e293b' }}
              value={addClassTo}
              onChange={e => setAddClassTo(e.target.value)}
            >
              <option value="">No — just create school account</option>
              {teacherClasses.map(c => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} {c.subject ? `(${c.subject})` : ''} {c.class_code ? `· Code: ${c.class_code}` : ''}
                </option>
              ))}
            </select>
            {addClassTo && (
              <small style={{ color: '#16a34a', fontSize: 12, display: 'block', marginTop: 6 }}>
                ✓ Student(s) will be added to this class immediately — no class code needed.
              </small>
            )}
          </div>
        )}

        {/* Single student form */}
        {mode === 'single' && !results && !teacherNeedsSchool && (
          <div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Full Name *</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, color: '#1e293b' }}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter student full name"
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Email (optional)</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, color: '#1e293b' }}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={studentEmailDomain ? `name@${studentEmailDomain}` : 'name@schoolname.edu (auto-generated if empty)'}
              />
              {studentEmailDomain && (
                <small style={{ color: '#64748b', fontSize: 12, display: 'block', marginTop: 6 }}>
                  Use <strong>@{studentEmailDomain}</strong> (school login). Not @mail.umunsi.com.
                </small>
              )}
            </div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Password (optional)</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, color: '#1e293b' }}
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
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Student Names (one per line) *</label>
              <textarea
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, minHeight: 120, resize: 'vertical', color: '#1e293b' }}
                value={bulkNames}
                onChange={e => setBulkNames(e.target.value)}
                placeholder={"Jean Mugisha\nMarie Uwimana\nPierre Habimana"}
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Password for all students (optional)</label>
              <input
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14, color: '#1e293b' }}
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
              {results.addedToClass && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, color: '#1e40af', fontSize: 13 }}>
                  ✓ Added to class: <strong>{results.addedToClass}</strong>
                </div>
              )}
              {results.joinWarning && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
                  ⚠ {results.joinWarning}
                </div>
              )}
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
            {results.addedToClass && (
              <div style={{ marginBottom: 12, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 13 }}>
                ✓ {results.joinedCount} student(s) added to class: <strong>{results.addedToClass}</strong>
                {results.joinFailures > 0 && <span style={{ color: '#92400e' }}> ({results.joinFailures} failed)</span>}
              </div>
            )}
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
