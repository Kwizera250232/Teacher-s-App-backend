import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import * as pdfjsLib from 'pdfjs-dist';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const KIND_LABEL = { exercise: '✏️ Unit Exercises', unit_test: '🏁 End-Unit Test', summative: '🎓 Summative Assessment' };

const PASS_PCT = 70;
const FLOWERS = ['🌸', '🌺', '🌷', '🌼', '🌻', '💐', '🌹'];

function FlowerShower() {
  const [petals] = useState(() => Array.from({ length: 28 }, (_, i) => ({
    f: FLOWERS[i % FLOWERS.length],
    left: Math.round(Math.random() * 100),
    delay: (Math.random() * 2.2).toFixed(2),
    dur: (3 + Math.random() * 2.5).toFixed(2),
    size: 22 + Math.round(Math.random() * 18),
  })));
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1001 }}>
      <style>{'@keyframes tbFlowerFall{0%{transform:translateY(-12vh) rotate(0deg);opacity:0}10%{opacity:1}100%{transform:translateY(110vh) rotate(540deg);opacity:.9}}'}</style>
      {petals.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: 0, left: `${p.left}%`, fontSize: p.size,
          animation: `tbFlowerFall ${p.dur}s ease-in ${p.delay}s 2 both`,
        }}>{p.f}</span>
      ))}
    </div>
  );
}

function QuizModal({ bookId, unitId, kind, unitTitle, token, onClose, onDone, onGoToPage }) {
  const [state, setState] = useState('loading');
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  // Scroll guard — a finger lifted after scrolling must never change the learner's answer
  const scrollingRef = useRef(false);

  useEffect(() => {
    api.get(`/textbooks/${bookId}/units/${unitId || 0}/quiz?kind=${kind}`, token)
      .then((d) => { setQuestions(d.questions || []); setState('quiz'); })
      .catch((e) => { setError(e.message || 'Could not load questions.'); setState('error'); });
  }, [bookId, unitId, kind, token]);

  useEffect(() => {
    let t;
    const onMove = () => {
      scrollingRef.current = true;
      clearTimeout(t);
      t = setTimeout(() => { scrollingRef.current = false; }, 180);
    };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('scroll', onMove, { passive: true, capture: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('scroll', onMove, { capture: true });
    };
  }, []);

  const pick = (oi) => {
    if (scrollingRef.current) return;
    setAnswers((a) => ({ ...a, [idx]: oi }));
  };

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
  const passed = pct >= PASS_PCT;
  const wrong = result ? questions.map((qq, i) => ({ ...qq, i, given: answers[i] })).filter((qq) => qq.given !== qq.answer) : [];
  // Weak points grouped by the book section to revise
  const weakTopics = Object.values(wrong.reduce((acc, w) => {
    const key = `${w.topic || 'This unit'}|${w.page || ''}`;
    if (!acc[key]) acc[key] = { topic: w.topic || 'This unit', page: w.page, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => (a.page || 0) - (b.page || 0));

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}
      // Keep touches inside the quiz — they must never turn the book's pages behind it
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {state === 'result' && passed && <FlowerShower />}
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '92vh', overflow: 'auto', padding: '18px 18px', overscrollBehavior: 'contain' }}>
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
              {q.options.map((opt, oi) => {
                const chosen = answers[idx] === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => pick(oi)}
                    aria-pressed={chosen}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      textAlign: 'left', padding: '13px 14px', borderRadius: 10, fontSize: 15, cursor: 'pointer',
                      border: chosen ? '2px solid #6366f1' : '1.5px solid #e2e8f0',
                      background: chosen ? '#eef2ff' : '#fff', color: '#1e293b',
                      touchAction: 'manipulation', userSelect: 'none',
                    }}
                  >
                    <span style={{
                      flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                      border: chosen ? 'none' : '2px solid #cbd5e1',
                      background: chosen ? '#6366f1' : '#fff', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
                    }}>{chosen ? '✓' : ''}</span>
                    <span><strong style={{ marginRight: 8 }}>{'ABCD'[oi]}.</strong>{opt}</span>
                  </button>
                );
              })}
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

        {state === 'result' && result && passed && (
          <div style={{ textAlign: 'center', padding: '24px 0 10px' }}>
            <div style={{ fontSize: 60 }}>💐</div>
            <h2 style={{ color: '#15803d', margin: '8px 0 4px' }}>Congratulations! 🌸</h2>
            <h3 style={{ color: '#312e81', margin: '0 0 8px' }}>{result.score} / {result.total} — {pct}%</h3>
            <p style={{ color: '#475569', margin: '0 0 16px' }}>
              Excellent work — you mastered <strong>{unitTitle}</strong>. These flowers are for you! Your best score is saved.
            </p>
            {wrong.length > 0 && (
              <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 14px' }}>
                Small thing to polish: {weakTopics.map((w) => `${w.topic}${w.page ? ` (p.${w.page})` : ''}`).join(', ')}
              </p>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose}>Continue reading</button>
          </div>
        )}

        {state === 'result' && result && !passed && (
          <div style={{ padding: '14px 0 4px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 50 }}>💪</div>
              <h3 style={{ color: '#b45309', margin: '6px 0 2px' }}>{result.score} / {result.total} — {pct}%</h3>
              <p style={{ color: '#64748b', margin: '0 0 14px', fontSize: 14 }}>
                You need {PASS_PCT}% to pass. Don’t worry — revise these parts of the book and try again.
              </p>
            </div>

            <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>📌 Your weak points — where to revise</div>
              {weakTopics.map((w, k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: k ? '1px solid #fde68a' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: '#1e293b' }}>
                    <strong>{w.topic}</strong>
                    <div style={{ fontSize: 12, color: '#78716c' }}>
                      {w.page ? `Page ${w.page}` : 'In this unit'} · {w.count} question{w.count > 1 ? 's' : ''} missed
                    </div>
                  </div>
                  {w.page && onGoToPage && (
                    <button type="button" className="btn btn-sm" style={{ background: '#f59e0b', color: '#fff', flexShrink: 0 }}
                      onClick={() => { onGoToPage(w.page); onClose(); }}>
                      📖 Revise p.{w.page}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 700, color: '#334155', marginBottom: 8, fontSize: 14 }}>Questions you missed</div>
            {wrong.map((w) => (
              <div key={w.i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', marginBottom: 8, fontSize: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{w.i + 1}. {w.question}</div>
                {w.given !== undefined && (
                  <div style={{ color: '#dc2626' }}>✗ Your answer: {'ABCD'[w.given]}. {w.options[w.given]}</div>
                )}
                <div style={{ color: '#15803d' }}>✓ Correct: {'ABCD'[w.answer]}. {w.options[w.answer]}</div>
                {(w.topic || w.page) && (
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                    Revise: {w.topic || 'this unit'}{w.page ? ` — page ${w.page}` : ''}
                  </div>
                )}
              </div>
            ))}

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" className="btn btn-primary" onClick={onClose}>Back to the book</button>
            </div>
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
    window.scrollTo({ top: 0 });
    const tk = ++renderToken.current;
    (async () => {
      const page = await pdf.getPage(pageNum);
      if (tk !== renderToken.current) return;
      const canvas = canvasRef.current;
      const vp = page.getViewport({ scale: 1 });
      const desktop = window.innerWidth >= 900;
      // Desktop: bigger page (fit a comfortable reading width, scroll down the page).
      // Mobile: whole page fits the screen.
      const maxW = desktop ? Math.min(window.innerWidth - 150, 1000) : Math.min(window.innerWidth - 12, 860);
      const maxH = desktop ? Infinity : window.innerHeight - 150;
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
  const onTouchStart = (e) => { touch.current = quiz || showContents ? null : e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null || quiz || showContents) return;
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
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', position: 'relative', overflowX: 'hidden' }}>
        {!pdf && !textPages ? (
          <div style={{ color: '#94a3b8', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <p>{loadMsg}</p>
          </div>
        ) : textPages ? (
          <div style={{
            background: '#fff', borderRadius: 10, width: '100%', maxWidth: 'min(940px, 100%)',
            minHeight: '62vh', maxHeight: '80vh', overflowY: 'auto',
            padding: 'clamp(20px, 5vw, 44px)', boxShadow: '0 10px 40px rgba(0,0,0,.5)',
            fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'clamp(15px, 1.6vw, 19px)',
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
            style={{ position: 'fixed', left: 10, top: '50%', zIndex: 20, transform: 'translateY(-50%)', background: 'rgba(99,102,241,.92)', color: '#fff', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 22, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>‹</button>
        )}
        {(pdf || textPages) && pageNum < pageCount && (
          <button type="button" onClick={() => setPageNum(p => p + 1)} aria-label="Next page"
            style={{ position: 'fixed', right: 10, top: '50%', zIndex: 20, transform: 'translateY(-50%)', background: 'rgba(99,102,241,.92)', color: '#fff', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 22, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>›</button>
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
          onGoToPage={(p) => setPageNum(Math.max(1, Math.min(pageCount || p, p)))}
        />
      )}
    </div>
  );
}
