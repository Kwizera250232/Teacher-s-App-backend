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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.72)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '92vh', overflow: 'auto', padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: '#312e81' }}>{KIND_LABEL[kind]}{unitTitle ? ` — ${unitTitle}` : ''}</h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
        </div>

        {state === 'loading' && (
          <div style={{ textAlign: 'center', padding: '50px 0', color: '#6366f1' }}>
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
                    textAlign: 'left', padding: '12px 14px', borderRadius: 10, fontSize: 15, cursor: 'pointer',
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

export default function TextbookReader() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const renderToken = useRef(0);

  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [data, setData] = useState(null);
  const [loadMsg, setLoadMsg] = useState('Opening book…');
  const [quiz, setQuiz] = useState(null); // {unitId, kind, unitTitle}

  const loadData = useCallback(() => {
    api.get(`/textbooks/${id}/learn`, token).then(setData).catch(() => setData({ error: true }));
  }, [id, token]);

  useEffect(() => {
    loadData();
    (async () => {
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
  }, [id, token, loadData]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const tk = ++renderToken.current;
    (async () => {
      const page = await pdf.getPage(pageNum);
      if (tk !== renderToken.current) return;
      const canvas = canvasRef.current;
      const maxW = Math.min(window.innerWidth - 20, 860);
      const vp = page.getViewport({ scale: 1 });
      const scale = maxW / vp.width;
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
  }, [pdf, pageNum]);

  if (!data || data.error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        {data?.error ? 'Could not load this book.' : loadMsg}
      </div>
    );
  }

  const { book, units = [], progress = [] } = data;
  const unit = units.find((u) => pageNum >= u.start_page && pageNum <= u.end_page) || null;

  const prog = (unitId, kind) => progress.find((p) => p.unit_id === unitId && p.kind === kind);
  const allTestsDone = units.length > 0 && units.every((u) => prog(u.id, 'unit_test'));
  const summative = progress.find((p) => p.kind === 'summative' && p.unit_id === 0);

  const nextUnit = units[units.indexOf(unit) + 1];

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#1e293b', color: '#fff', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => navigate('/student/textbooks')} style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>← Library</button>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📖 {book.title}</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>{book.grade_level} · {book.subject} · Page {pageNum} / {pageCount || '…'}</div>
        </div>
      </header>

      {/* Unit rail */}
      <div style={{ background: '#1e293b', padding: '0 14px 10px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {units.map((u) => {
          const ex = prog(u.id, 'exercise');
          const test = prog(u.id, 'unit_test');
          const active = unit?.id === u.id;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setPageNum(u.start_page)}
              title={`${u.title} — pages ${u.start_page}–${u.end_page}`}
              style={{
                whiteSpace: 'nowrap', borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                border: active ? '2px solid #818cf8' : '1px solid #334155',
                background: test ? '#065f46' : ex ? '#1e40af' : active ? '#3730a3' : '#0f172a',
                color: '#fff',
              }}
            >
              {test ? '🏆' : ex ? '✏️' : '🔖'} {u.title} {test && `(${Math.round(test.pct)}%)`}
            </button>
          );
        })}
        <span style={{
          whiteSpace: 'nowrap', borderRadius: 20, padding: '6px 14px', fontSize: 12,
          border: '1px solid #334155', color: '#fff',
          background: summative ? '#7c2d12' : allTestsDone ? '#92400e' : '#0f172a',
          opacity: allTestsDone ? 1 : 0.55,
        }}>
          🎓 Summative {summative ? `— ${Math.round(summative.pct)}%` : allTestsDone ? '— unlocked!' : '— finish all units'}
        </span>
      </div>

      {/* Page canvas */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 8px', position: 'relative' }}>
        {!pdf ? (
          <div style={{ color: '#94a3b8', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <p>{loadMsg}</p>
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,.5)', background: '#fff', maxWidth: '100%' }} />
        )}
        {pdf && pageNum > 1 && (
          <button type="button" onClick={() => setPageNum(p => p - 1)} aria-label="Previous page"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(99,102,241,.9)', color: '#fff', border: 'none', borderRadius: '50%', width: 46, height: 46, fontSize: 20, cursor: 'pointer' }}>‹</button>
        )}
        {pdf && pageNum < pageCount && (
          <button type="button" onClick={() => setPageNum(p => p + 1)} aria-label="Next page"
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(99,102,241,.9)', color: '#fff', border: 'none', borderRadius: '50%', width: 46, height: 46, fontSize: 20, cursor: 'pointer' }}>›</button>
        )}
      </main>

      {/* Unit action bar */}
      {pdf && unit && (
        <div style={{ background: '#1e293b', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: '#cbd5e1', fontSize: 13, flex: 1, minWidth: 140 }}>
            {unit.title} · pages {unit.start_page}–{unit.end_page}
          </div>
          {pageNum >= unit.end_page && !prog(unit.id, 'exercise') && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setQuiz({ unitId: unit.id, kind: 'exercise', unitTitle: unit.title })}>
              ✏️ Unit Exercises
            </button>
          )}
          {prog(unit.id, 'exercise') && !prog(unit.id, 'unit_test') && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setQuiz({ unitId: unit.id, kind: 'unit_test', unitTitle: unit.title })}>
              🏁 End-Unit Test
            </button>
          )}
          {prog(unit.id, 'unit_test') && nextUnit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPageNum(nextUnit.start_page)}>
              Next unit: {nextUnit.title} →
            </button>
          )}
          {allTestsDone && !summative && (
            <button type="button" className="btn btn-primary btn-sm" style={{ background: '#d97706' }} onClick={() => setQuiz({ unitId: 0, kind: 'summative', unitTitle: book.title })}>
              🎓 Take Summative Assessment
            </button>
          )}
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
