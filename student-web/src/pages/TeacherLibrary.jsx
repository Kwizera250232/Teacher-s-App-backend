import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import DocPreviewModal from '../components/DocPreviewModal';

const TYPES = [
  { id: 'all', label: 'All' },
  { id: 'homework', label: '📋 Homework' },
  { id: 'quiz', label: '📝 Quizzes' },
  { id: 'note', label: '📒 Notes' },
];
const ICON = { homework: '📋', quiz: '📝', note: '📒' };
const LEVEL = { primary: 'Primary', secondary: 'Secondary', other: 'Other' };
const GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
const FOLDER = { homework: 'homework', note: 'notes' };

function quizToText(quiz, questions) {
  const lines = [quiz.title, quiz.teacher_name ? `By ${quiz.teacher_name}` : '', ''];
  questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.question}`);
    ['a', 'b', 'c', 'd'].forEach((k) => q[`option_${k}`] && lines.push(`   ${k.toUpperCase()}) ${q[`option_${k}`]}`));
    lines.push(`   Answer: ${String(q.correct_answer || '').toUpperCase()}`, '');
  });
  return lines.join('\n');
}

export default function TeacherLibrary() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [quizView, setQuizView] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.get('/teacher-library', token).then(setData).catch((e) => setError(e.message || 'Could not load.'));
  }, [token]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items || []).filter((i) => (type === 'all' || i.type === type)
      && (!q || [i.title, i.subject, i.teacher.name, i.teacher.school, i.class_name].some((v) => String(v || '').toLowerCase().includes(q))));
  }, [data, type, search]);

  const fileUrl = (i, inline) => `${UPLOADS_BASE}/download/${FOLDER[i.type]}/${i.file_path}${inline ? '?inline=1' : ''}`;

  const openQuiz = async (i) => {
    setBusy(`${i.type}-${i.id}`);
    try {
      const r = await api.get(`/teacher-library/quiz/${i.id}`, token);
      setQuizView(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const downloadQuiz = () => {
    const blob = new Blob([quizToText(quizView.quiz, quizView.questions)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${quizView.quiz.title.replace(/[^a-z0-9]+/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const btn = { border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 15 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19 }}>📚 Colleagues&apos; Library</h1>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.9 }}>
            View and download other teachers&apos; homework, quizzes and notes{data?.my_levels?.length ? ` — open for your level: ${data.my_levels.map((l) => LEVEL[l] || l).join(', ')}` : ''}.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '16px 14px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => setType(t.id)} style={{ ...btn, background: type === t.id ? '#0f766e' : '#fff', color: type === t.id ? '#fff' : '#334155', border: '1px solid #cbd5e1' }}>{t.label}</button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, teacher, school…" style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }} />
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>{error}</div>}
        {!data && !error && <p style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Loading…</p>}
        {data && data.unleveled_classes?.length > 0 && (
          <div style={{ background: '#fff', border: '1.5px solid #fde68a', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontWeight: 800, color: '#92400e', fontSize: 14, marginBottom: 8 }}>
              ⚠️ {data.unleveled_classes.length} class(es) have no level — pick one so colleagues can open your documents
            </div>
            {data.unleveled_classes.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#334155' }}>{c.name}</span>
                <select
                  defaultValue=""
                  onChange={async (e) => {
                    const g = e.target.value;
                    if (!g) return;
                    try {
                      await api.put('/teacher-library/class-grade', { class_id: c.id, grade: g }, token);
                      setData((d) => ({ ...d, unleveled_classes: d.unleveled_classes.filter((x) => x.id !== c.id), my_levels: [...new Set([...d.my_levels, /^S/.test(g) ? 'secondary' : 'primary'])] }));
                    } catch { setError('Could not save the grade.'); }
                  }}
                  style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13 }}
                >
                  <option value="">Set level…</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {data && data.my_levels.length === 0 && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontWeight: 800, color: '#92400e', fontSize: 14, marginBottom: 4 }}>Choose your class grade to open documents</div>
            <div style={{ fontSize: 13, color: '#92400e', marginBottom: 10 }}>
              Pick the grade you teach — documents for your level unlock instantly. Other levels stay locked.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={async () => {
                    try {
                      await api.put('/teacher-library/my-grade', { grade: g }, token);
                      setData((d) => ({ ...d, my_grade: g, my_levels: [...new Set([...d.my_levels, /^S/.test(g) ? 'secondary' : 'primary'])] }));
                    } catch { setError('Could not save your grade.'); }
                  }}
                  style={{ ...btn, background: '#fff', color: '#92400e', border: '1.5px solid #f59e0b' }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
        {data && items.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Nothing here yet.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
          {items.map((i) => {
            const key = `${i.type}-${i.id}`;
            return (
              <div key={key} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', opacity: i.locked ? 0.92 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 24 }}>{i.locked ? '🔒' : ICON[i.type]}</span>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14, flex: 1 }}>{i.title}</div>
                  <span style={{ fontSize: 11, background: i.level === 'secondary' ? '#ede9fe' : '#dbeafe', color: i.level === 'secondary' ? '#6d28d9' : '#1d4ed8', borderRadius: 6, padding: '2px 7px', fontWeight: 700 }}>{LEVEL[i.level]}</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', margin: '6px 0 10px' }}>
                  {i.subject ? `${i.subject} · ` : ''}{i.class_name}<br />
                  👩‍🏫 {i.teacher.online && <span style={{ color: '#16a34a', fontWeight: 700 }}>● </span>}<span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/teacher-profile/${i.teacher.id}`)}>{i.teacher.name}</span>{i.teacher.school ? ` · ${i.teacher.school}` : ''}
                </div>

                {i.locked ? (
                  <div>
                    <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                      This is {LEVEL[i.level]} material. Open the teacher&apos;s profile and message or call them to ask for it.
                    </div>
                    <button type="button" onClick={() => navigate(`/teacher-profile/${i.teacher.id}`)} style={{ ...btn, background: '#0f766e', color: '#fff' }}>👤 View profile · message · call</button>
                  </div>
                ) : i.type === 'quiz' ? (
                  <button type="button" disabled={busy === key} onClick={() => openQuiz(i)} style={{ ...btn, background: '#0f766e', color: '#fff' }}>
                    {busy === key ? 'Opening…' : `👁 View ${i.question_count} questions`}
                  </button>
                ) : i.file_path ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setPreview({ fileUrl: fileUrl(i, true), fileName: i.file_name || i.title })} style={{ ...btn, background: '#0f766e', color: '#fff' }}>👁 View</button>
                    <a href={fileUrl(i, false)} style={{ ...btn, background: '#e2e8f0', color: '#0f172a', textDecoration: 'none', display: 'inline-block' }}>⬇ Download</a>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{i.description || 'No file attached.'}</div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {preview && <DocPreviewModal fileUrl={preview.fileUrl} fileName={preview.fileName} onClose={() => setPreview(null)} />}

      {quizView && (
        <div onClick={(e) => e.target === e.currentTarget && setQuizView(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 640, width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>📝 {quizView.quiz.title}</h2>
              <button type="button" onClick={downloadQuiz} style={{ ...btn, background: '#0f766e', color: '#fff' }}>⬇ Download</button>
              <button type="button" onClick={() => setQuizView(null)} style={{ ...btn, background: '#e2e8f0', color: '#0f172a' }}>✕</button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b' }}>By {quizView.quiz.teacher_name} · view only</p>
            {quizView.questions.map((q, n) => (
              <div key={n} style={{ marginBottom: 14, fontSize: 14 }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{n + 1}. {q.question}</div>
                {['a', 'b', 'c', 'd'].map((k) => q[`option_${k}`] && (
                  <div key={k} style={{ marginLeft: 12, color: q.correct_answer === k ? '#15803d' : '#334155', fontWeight: q.correct_answer === k ? 700 : 400 }}>
                    {k.toUpperCase()}) {q[`option_${k}`]}{q.correct_answer === k ? ' ✓' : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
