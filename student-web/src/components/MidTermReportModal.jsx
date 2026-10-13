import { useEffect, useState } from 'react';
import { API_BASE } from '../api';

const TERMS = ['I', 'II', 'III'];
const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };

export default function MidTermReportModal({ classId, token, student, onClose, onError }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [defaults, setDefaults] = useState({});
  const [scores, setScores] = useState([]);
  const [form, setForm] = useState({ school_name: '', district: '', level: 'Primary', academic_year: '', term: 'I', subjects: [], logo: null });
  const [comment, setComment] = useState('');
  const [newSubject, setNewSubject] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/catmarks/${classId}/midterm-report/prefill?student_id=${student.studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load');
        if (!alive) return;
        setDefaults(d.defaults || {});
        setScores(d.scores || []);
        setForm({
          school_name: d.school_name || '', district: d.district || '', level: d.level || 'Primary',
          academic_year: d.academic_year || '', term: d.term || 'I', subjects: d.subjects || [], logo: d.logo || null,
        });
      } catch (e) {
        onError?.(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [classId, student.studentId, token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const scoreFor = (name) => scores.find((s) => norm(s.name) === norm(name))?.score;
  const unlisted = scores.filter((s) => !form.subjects.some((n) => norm(n) === norm(s.name)));

  const onLevel = (lvl) => {
    setForm((f) => ({ ...f, level: lvl, subjects: defaults[lvl] || f.subjects }));
  };
  const removeSubject = (i) => set('subjects', form.subjects.filter((_, idx) => idx !== i));
  const addSubject = (name) => {
    const n = String(name || '').trim();
    if (!n || form.subjects.some((s) => norm(s) === norm(n))) return;
    set('subjects', [...form.subjects, n]);
    setNewSubject('');
  };
  const onLogo = (file) => {
    if (!file) return;
    if (file.size > 400 * 1024) { onError?.('Logo must be under 400 KB.'); return; }
    const r = new FileReader();
    r.onload = () => set('logo', r.result);
    r.readAsDataURL(file);
  };

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/catmarks/${classId}/midterm-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ student_id: student.studentId, teacher_comment: comment, ...form }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MidTerm-${form.term}-Report-${(student.studentName || 'student').replace(/[^\w]+/g, '-')}.doc`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      onError?.(e.message || 'Could not generate the report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 19 }}>📄 Mid-Term Report Card</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
          For <strong>{student.studentName}</strong> — marks come only from the Marks tab (teacher-recorded). School details are remembered for this class.
        </p>

        {loading ? <p style={{ color: '#64748b' }}>Loading…</p> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div><label style={lbl}>School name</label><input style={inp} value={form.school_name} onChange={(e) => set('school_name', e.target.value)} placeholder="BRIGHT SCHOOL" /></div>
              <div><label style={lbl}>District</label><input style={inp} value={form.district} onChange={(e) => set('district', e.target.value)} placeholder="MUHANGA" /></div>
              <div><label style={lbl}>Level</label>
                <select style={inp} value={form.level} onChange={(e) => onLevel(e.target.value)}>
                  <option>Primary</option><option>Secondary</option>
                </select>
              </div>
              <div><label style={lbl}>Academic year</label><input style={inp} value={form.academic_year} onChange={(e) => set('academic_year', e.target.value)} placeholder="2025-2026" /></div>
              <div><label style={lbl}>Term</label>
                <select style={inp} value={form.term} onChange={(e) => set('term', e.target.value)}>
                  {TERMS.map((t) => <option key={t} value={t}>Term {t}</option>)}
                </select>
              </div>
              <div><label style={lbl}>School logo (optional)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {form.logo && <img src={form.logo} alt="logo" style={{ width: 38, height: 38, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 6 }} />}
                  <input type="file" accept="image/*" style={{ fontSize: 12, flex: 1 }} onChange={(e) => onLogo(e.target.files?.[0])} />
                  {form.logo && <button type="button" className="btn btn-outline btn-sm" onClick={() => set('logo', null)}>✕</button>}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Subjects on the report ({form.subjects.length}) — remove ✕ or add below</label>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {form.subjects.map((s, i) => {
                  const sc = scoreFor(s);
                  return (
                    <div key={`${s}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: 13 }}>
                      <span style={{ color: '#94a3b8', width: 22 }}>{i + 1}.</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{s}</span>
                      <span style={{ color: sc == null ? '#cbd5e1' : '#166534', fontWeight: 600, minWidth: 54, textAlign: 'right' }}>{sc == null ? 'no marks' : `${sc}/100`}</span>
                      <button type="button" onClick={() => removeSubject(i)} title="Remove" style={{ border: 'none', background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontSize: 15 }}>✕</button>
                    </div>
                  );
                })}
                {!form.subjects.length && <p style={{ margin: 0, padding: 12, fontSize: 13, color: '#94a3b8' }}>No subjects — add some below.</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input style={{ ...inp, flex: 1 }} placeholder="Add a subject (e.g. Religion)" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubject(newSubject))} />
                <button type="button" className="btn btn-outline" onClick={() => addSubject(newSubject)}>+ Add</button>
              </div>
              {unlisted.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                  Marks recorded but not on report:{' '}
                  {unlisted.map((s) => (
                    <button key={s.name} type="button" onClick={() => addSubject(s.name)} style={{ margin: '2px 4px 2px 0', padding: '2px 8px', borderRadius: 999, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', cursor: 'pointer', fontSize: 12 }}>
                      + {s.name} ({s.score})
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8, fontSize: 11 }} onClick={() => set('subjects', defaults[form.level] || [])}>
                ↺ Reset to default {form.level} subjects
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Teacher's comment on the report</label>
              <textarea
                rows={3}
                placeholder="e.g., Steady improvement this mid-term. Encourage more practice in Mathematics."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ ...inp, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy || !form.subjects.length} onClick={generate}>
                {busy ? '⏳ Generating…' : '⬇️ Generate Word Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
