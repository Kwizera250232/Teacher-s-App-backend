import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import * as pdfjsLib from 'pdfjs-dist';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const KIND_LABEL = { exercise: '✏️ Unit Exercises', unit_test: '🏁 End-Unit Test', summative: '🎓 Summative Assessment' };

function QuizModal({ bookId, unitId, kind, unitTitle, token, onClose, onDone }) {
  const [state, setState] = useState('loading');
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/textbooks/${bookId}/units/${unitId || 0}/quiz?kind=${kind}`, token)
      .then((d) => { setQuestions(d.questions || []); setState('quiz'); })
      .catch((e) => { setError(e.message || 'Could not load questions.'); setState('error'); });
  }, [bookId, unitId, kind, token]);

  const submit = async () => {
    const score = questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
    setResult({ score, total: questions.length });
    setState('result');
    try {
      await api.post(`/textbooks/${bookId}/result`, { unit_id: unitId || 0, kind, score, total: questions.length }, token);
    } catch { /* keep UI result even if save fails */ }
    onDone?.();
  };

  const q = questions[idx];
  const pct = result ? Math.round((result.score / result.total) * 100) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '92vh', overflow: 'auto', padding: '18px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#312e81' }}>{KIND_LABEL[kind]}{unitTitle ? ` — ${unitTitle}` : ''}</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        {state === 'loading' && (
          <div style={{ textAlign: 'center', padding: '50px 10px', color: '#6366f1' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🤖</div>
            <p>UClass AI is preparing questions from this exact unit…</p>
          </div>
        )}
        {state === 'error' && <p style={{ color: '#dc2626' }}>{error}</p>}

        {state === 'quiz' && q && (
          <>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Question {idx + 1} / {questions.length}</div>
            <div style={{ height: 6, background: '#e2e8f0', borderRadius: 4, marginBottom: 16 }}>
              <div style={{ height: '100%', width: `${(idx / questions.length) * 100}%`, background: '#6366f1', borderRadius: 4, transition: 'width .2s' }} />
            </div>
            <p style={{ fontWeight: 600, fontSize: 16, color: '#0f172a', lineHeight: 1.5 }}>{q.question}</p>
            <div style={{ display: 'grid', gap: 10, margin: '16px 0' }}>
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [idx]: oi }))}
                  style={{
                    textAlign: 'left', padding: '13px 14px', borderRadius: 10, fontSize: 15, cursor: 'pointer',
                    border: answers[idx] === oi ? '2px solid #6366f1' : '1.5px solid #e2e8f0',
                    background: answers[idx] === oi ? '#eef2ff' : '#fff', color: '#1e293b',
                  }}
                >
                  <strong style={{ marginRight: 8 }}>{'ABCD'[oi]}.</strong>{opt}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" disabled={idx === 0} onClick={() => setIdx(i => i - 1)} className="btn btn-secondary btn-sm">← Prev</button>
              {idx < questions.length - 1 ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setIdx(i => i + 1)} disabled={answers[idx] === undefined}>Next →</button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={Object.keys(answers).length < questions.length}>Submit ✓</button>
              )}
            </div>
          </>
        )}

        {state === 'result' && result && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 56 }}>{pct >= 50 ? '🎉' : '💪'}</div>
            <h2 style={{ color: '#312e81', margin: '10px 0 4px' }}>{result.score} / {result.total} — {pct}%</h2>
            <p style={{ color: '#64748b' }}>{pct >= 50 ? 'Well done! Your best score is saved.' : 'Score saved. You can read again and retry anytime.'}</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>Continue reading</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Text-mode page: every line exactly as printed, in the same order — nothing merged or moved.
// Only all-caps heading lines are emphasised so headings / subheadings stand out like in the book.
function renderTextPage(text) {
  const CAPS_RE = /^[^a-z]*[A-ZÀ-Ý]{3}[^a-z]*$/;
  return String(text).split('\n').map((line, i) => {
    const t = line.replace(/\s+$/, '');
    const heading = t.trim().length > 2 && t.trim().length <= 90 && CAPS_RE.test(t.trim()) && !/\.{4,}/.test(t);
    return (
      <div key={i} style={heading ? { fontWeight: 700, color: '#1e1b4b', marginTop: 6 } : undefined}>
        {t || '\u00A0'}
      </div>
    );
  });
}

export default function TextbookReader() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const libraryPath = user?.role === 'student' ? '/student/textbooks'
    : user?.role === 'head_teacher' ? '/head-teacher/textbooks' : '/teacher/textbooks';

  const canvasRef = useRef(null);
  const renderToken = useRef(0);
  const touch = useRef(null);

  const [pdf, setPdf] = useState(null);
  const [textPages, setTextPages] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [data, setData] = useState(null);
  const [loadMsg, setLoadMsg] = useState('Opening book…');
  const [quiz, setQuiz] = useState(null);
  const [showContents, setShowContents] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const d = await api.get(`/textbooks/${id}/learn`, token);
      setData(d);
      if (d && d.has_file === false) {
        const tp = await api.get(`/textbooks/${id}/textpages`, token);
        const pages = tp?.pages || [];
        setTextPages(pages);
        setPageCount(pages.length);
      }
      return d;
    } catch {
      setData({ error: true });
      return null;
    }
  }, [id, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await loadData();
      if (cancelled || !d || d.error || d.has_file === false) return;
      try {
        const res = await fetch(`${API_BASE}/textbooks/${id}/file`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Could not load the book file.');
        const buf = await res.arrayBuffer();
        setLoadMsg('Preparing pages…');
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch (e) {
        setLoadMsg(`⚠️ ${e.message || 'Failed to open book.'}`);
      }
    })();
    return () => { cancelled = true; };
  }, [id, token, loadData]);

  // Render current PDF page fitted to the screen (mobile-responsive)
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const tk = ++renderToken.current;
    (async () => {
      const page = await pdf.getPage(pageNum);
      if (tk !== renderToken.current) return;
      const canvas = canvasRef.current;
      const maxW = Math.min(window.innerWidth - 12, 860);
      const maxH = window.innerHeight - 150;
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(maxW / vp.width, maxH / vp.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = `${vp.width * scale}px`;
      canvas.style.height = `${vp.height * scale}px`;
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
  }, [pdf, pageNum]);

  // Swipe to turn pages (mobile)
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (dx < -50 && pageNum < pageCount) setPageNum((p) => p + 1);
    else if (dx > 50 && pageNum > 1) setPageNum((p) => p - 1);
  };

  if (!data || data.error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', background: '#0f172a' }}>
        {data?.error ? 'Could not load this book.' : loadMsg}
      </div>
    );
  }

  const { book, units = [], progress = [] } = data;
  const unit = units.find((u) => pageNum >= u.start_page && pageNum <= u.end_page) || null;
  const prog = (unitId, kind) => progress.find((p) => p.unit_id === unitId && p.kind === kind);
  const allTestsDone = units.length > 0 && units.every((u) => prog(u.id, 'unit_test'));
  const summative = progress.find((p) => p.kind === 'summative' && p.unit_id === 0);
  // Tests unlock only from the book's own "END OF UNIT ASSESSMENT" / "Isuzuma risoza umutwe" page
  const unitFinished = unit && pageNum >= (unit.assess_page || unit.end_page);

  return (
    <div
      style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Slim header */}
      <header style={{ background: '#1e293b', color: '#fff', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={() => navigate(libraryPath)} style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>← Library</button>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>📖 {book.title}</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>{book.grade_level} · {book.subject} · Page {pageNum} / {pageCount || '…'}</div>
        </div>
        <button type="button" onClick={() => setShowContents(true)} style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>☰ Units</button>
      </header>

      {/* Page — rendered exactly like the real book */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', position: 'relative', overflow: 'hidden' }}>
        {!pdf && !textPages ? (
          <div style={{ color: '#94a3b8', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <p>{loadMsg}</p>
          </div>
        ) : textPages ? (
          <div style={{
            background: '#fff', borderRadius: 10, width: '100%', maxWidth: 760,
            minHeight: '62vh', maxHeight: '80vh', overflowY: 'auto',
            padding: 'clamp(20px, 5vw, 44px)', boxShadow: '0 10px 40px rgba(0,0,0,.5)',
            fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'clamp(15px, 2.6vw, 17px)',
            lineHeight: 1.6, color: '#1f2937', overflowWrap: 'anywhere',
          }}>
            {renderTextPage(textPages[pageNum - 1] || '')}
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 24 }}>— {pageNum} —</div>
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ borderRadius: 6, boxShadow: '0 10px 40px rgba(0,0,0,.5)', background: '#fff' }} />
        )}

        {(pdf || textPages) && pageNum > 1 && (
          <button type="button" onClick={() => setPageNum(p => p - 1)} aria-label="Previous page"
            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(99,102,241,.92)', color: '#fff', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 22, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>‹</button>
        )}
        {(pdf || textPages) && pageNum < pageCount && (
          <button type="button" onClick={() => setPageNum(p => p + 1)} aria-label="Next page"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(99,102,241,.92)', color: '#fff', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 22, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>›</button>
        )}
      </main>

      {/* Unit-finished banner — appears automatically at a unit's last page */}
      {unitFinished && !prog(unit.id, 'exercise') && (
        <div style={{ background: 'linear-gradient(135deg,#312e81,#4f46e5)', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160, fontSize: 14 }}>
            📝 <strong>{unit.title}</strong> — End of Unit Assessment reached. Practise first, then take the test.
          </div>
          <button type="button" className="btn btn-sm" style={{ background: '#fff', color: '#312e81', fontWeight: 700 }}
            onClick={() => setQuiz({ unitId: unit.id, kind: 'exercise', unitTitle: unit.title })}>
            ✏️ Unit Exercises
          </button>
        </div>
      )}
      {unitFinished && prog(unit.id, 'exercise') && !prog(unit.id, 'unit_test') && (
        <div style={{ background: '#065f46', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160, fontSize: 14 }}>Exercises done — now take the <strong>End-Unit Test</strong> for {unit.title}.</div>
          <button type="button" className="btn btn-sm" style={{ background: '#fff', color: '#065f46', fontWeight: 700 }}
            onClick={() => setQuiz({ unitId: unit.id, kind: 'unit_test', unitTitle: unit.title })}>
            🏁 End-Unit Test
          </button>
        </div>
      )}
      {allTestsDone && !summative && pageNum >= pageCount && (
        <div style={{ background: '#92400e', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160, fontSize: 14 }}>🎓 You finished the whole book! Take the <strong>Summative Assessment</strong>.</div>
          <button type="button" className="btn btn-sm" style={{ background: '#fff', color: '#92400e', fontWeight: 700 }}
            onClick={() => setQuiz({ unitId: 0, kind: 'summative', unitTitle: book.title })}>
            🎓 Summative Assessment
          </button>
        </div>
      )}

      {/* Contents overlay — units + progress, opens on demand */}
      {showContents && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.7)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setShowContents(false)}>
          <div style={{ background: '#fff', width: 'min(340px, 88vw)', height: '100%', padding: '18px 16px', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>📑 Contents</h3>
              <button type="button" onClick={() => setShowContents(false)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>✕</button>
            </div>
            {units.map((u, i) => {
              const ex = prog(u.id, 'exercise');
              const test = prog(u.id, 'unit_test');
              return (
                <button key={u.id} type="button"
                  onClick={() => { setPageNum(u.start_page); setShowContents(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 8,
                    border: unit?.id === u.id ? '2px solid #6366f1' : '1.5px solid #e2e8f0',
                    borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#1e293b',
                  }}>
                  <div style={{ fontWeight: 700 }}>{test ? '🏆' : ex ? '✏️' : '🔖'} {u.title}</div>
                  <div style={{ fontSize: 12, color: '#94a3af', marginTop: 3 }}>
                    Pages {u.start_page}–{u.end_page}
                    {u.assess_page && ` · End-unit assessment p.${u.assess_page}`}
                    {ex && ` · Exercises ${Math.round(ex.pct)}%`}
                    {test && ` · Test ${Math.round(test.pct)}%`}
                  </div>
                </button>
              );
            })}
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: allTestsDone ? '#fffbeb' : '#f8fafc', border: '1.5px solid ' + (allTestsDone ? '#fcd34d' : '#e2e8f0') }}>
              <strong style={{ fontSize: 14 }}>🎓 Summative Assessment</strong>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {summative ? `Done — best ${Math.round(summative.pct)}%` : allTestsDone ? 'Unlocked! Finish the book to take it.' : 'Finish all unit tests to unlock.'}
              </div>
              {allTestsDone && !summative && (
                <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}
                  onClick={() => { setShowContents(false); setQuiz({ unitId: 0, kind: 'summative', unitTitle: book.title }); }}>
                  Take it now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {quiz && (
        <QuizModal
          bookId={id}
          unitId={quiz.unitId}
          kind={quiz.kind}
          unitTitle={quiz.unitTitle}
          token={token}
          onClose={() => setQuiz(null)}
          onDone={loadData}
        />
      )}
    </div>
  );
}
