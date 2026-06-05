import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';
import VerifiedBadge from './VerifiedBadge';

function TeacherPickCard({ teacher, selected, onSelect, disabled, hint }) {
  if (!teacher) return null;
  return (
    <button
      type="button"
      onClick={() => onSelect(teacher)}
      disabled={disabled}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 14px',
        marginBottom: 8,
        borderRadius: 10,
        border: selected ? '2px solid #075e54' : '2px solid #e2e8f0',
        background: selected ? '#ecfdf5' : 'white',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
        {teacher.name}
        {teacher.is_verified && (
          <VerifiedBadge
            size={14}
            info={{
              items: [
                { icon: '✓', label: 'Verified', value: 'Teacher on UClass' },
                {
                  icon: '👤',
                  label: 'Role',
                  value: teacher.role === 'head_teacher' ? 'Head teacher' : 'Teacher',
                },
              ],
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{teacher.email}</div>
      {hint && (
        <div style={{ fontSize: 12, color: selected ? '#075e54' : '#64748b', marginTop: 6 }}>{hint}</div>
      )}
    </button>
  );
}

export default function QuizColleagueShareModal({ classId, quizId, quizTitle, onClose, onSent, token }) {
  const [colleagues, setColleagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupHint, setLookupHint] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successNote, setSuccessNote] = useState('');

  const classQuery = classId ? `class_id=${encodeURIComponent(classId)}` : '';

  const loadColleagues = useCallback((search = '') => {
    const q = search.trim();
    const params = [classQuery, q ? `q=${encodeURIComponent(q)}` : ''].filter(Boolean).join('&');
    const path = `/quiz-teacher-shares/colleagues${params ? `?${params}` : ''}`;
    return api.get(path, token);
  }, [token, classQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadColleagues()
      .then((rows) => {
        if (cancelled) return;
        setColleagues(rows);
        if (rows.length === 1) setSelected(rows[0]);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load teachers.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadColleagues]);

  const filteredColleagues = useMemo(() => {
    const q = emailInput.trim().toLowerCase();
    if (!q) return colleagues;
    return colleagues.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    );
  }, [colleagues, emailInput]);

  const pickTeacher = (teacher) => {
    setSelected(teacher);
    setEmailInput(teacher.email || '');
    setLookupHint('Selected — tap Send quiz invitation below.');
    setError('');
  };

  const lookupByEmail = async () => {
    const email = emailInput.trim();
    if (!email) {
      setError('Enter the teacher\'s UClass login email.');
      return;
    }
    setLookupLoading(true);
    setError('');
    setLookupHint('');
    try {
      const data = await api.get(
        `/quiz-teacher-shares/lookup?email=${encodeURIComponent(email)}&${classQuery}`,
        token
      );
      const { teacher, can_invite, reason } = data;
      if (can_invite) {
        pickTeacher(teacher);
        if (!colleagues.some((c) => String(c.id) === String(teacher.id))) {
          setColleagues((prev) => [...prev, teacher].sort((a, b) => a.name.localeCompare(b.name)));
        }
      } else {
        setSelected(null);
        setLookupHint(reason || 'This teacher cannot receive this quiz yet.');
      }
    } catch (err) {
      setSelected(null);
      setError(err.message || 'Teacher not found.');
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    const email = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
    const timer = setTimeout(() => {
      lookupByEmail();
    }, 500);
    return () => clearTimeout(timer);
  }, [emailInput, classQuery, token]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccessNote('');
    try {
      const body = { message: message.trim() || undefined };
      if (selected?.id) body.recipient_teacher_id = Number(selected.id);
      else if (emailInput.trim()) body.recipient_email = emailInput.trim().toLowerCase();
      else {
        setError('Enter a teacher email or select someone from the list.');
        setBusy(false);
        return;
      }

      const res = await api.post(
        `/quiz-teacher-shares/from-class/${classId}/quizzes/${quizId}`,
        body,
        token
      );
      setSuccessNote(res.message || 'Invitation sent.');
      onSent?.();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message || 'Could not send invitation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cm-modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', color: '#075e54' }}>
          Share quiz with a colleague
        </h2>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          {quizTitle ? `"${quizTitle}"` : 'This quiz'} — enter a teacher&apos;s <strong>UClass email</strong>, select
          them, then send. They accept on their dashboard before students see it.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {successNote && <div className="alert alert-success">{successNote}</div>}

        <form onSubmit={submit}>
          <label className="form-group">
            <strong style={{ fontSize: 14 }}>Teacher email (already on UClass)</strong>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setLookupHint('');
                  if (!e.target.value.trim()) setSelected(null);
                }}
                placeholder="colleague@brightschool.edu"
                disabled={busy}
                autoFocus
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={lookupByEmail}
                disabled={busy || lookupLoading}
              >
                {lookupLoading ? '…' : 'Find'}
              </button>
            </div>
            <small style={{ color: '#64748b', fontSize: 12, display: 'block', marginTop: 6 }}>
              Type their login email — we search teachers already registered at your school.
            </small>
          </label>

          {lookupHint && !error && (
            <p style={{ fontSize: 13, color: lookupHint.includes('Selected') ? '#075e54' : '#b45309', margin: '0 0 12px' }}>
              {lookupHint}
            </p>
          )}

          {selected && (
            <div style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 13, color: '#334155' }}>Selected teacher</strong>
              <TeacherPickCard
                teacher={selected}
                selected
                onSelect={pickTeacher}
                disabled={busy}
                hint="Ready to send invitation"
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <strong style={{ fontSize: 14, color: '#334155' }}>
              Teachers at your school {loading ? '…' : `(${colleagues.length})`}
            </strong>
            {loading ? (
              <p className="phub-muted" style={{ marginTop: 8 }}>Loading…</p>
            ) : filteredColleagues.length === 0 ? (
              <p className="phub-muted" style={{ marginTop: 8, fontSize: 13 }}>
                {emailInput.trim()
                  ? 'No match in your school list — use Find to search by exact email.'
                  : 'No other teachers listed yet. Enter their UClass email above.'}
              </p>
            ) : (
              <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                {filteredColleagues.map((c) => (
                  <TeacherPickCard
                    key={c.id}
                    teacher={c}
                    selected={selected && String(selected.id) === String(c.id)}
                    onSelect={pickTeacher}
                    disabled={busy}
                    hint={
                      selected && String(selected.id) === String(c.id)
                        ? 'Selected'
                        : 'Tap to select'
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <label className="form-group">
            Message (optional)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={busy}
              placeholder="e.g. Please use this with your P6 class."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10 }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={busy || (!selected && !emailInput.trim())}
            >
              {busy ? 'Sending…' : 'Send quiz invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
