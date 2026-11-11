import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const C = { blue: '#00A1DE', yellow: '#FAD201', green: '#20603D', dark: '#0b2447' };

function say(text) {
  try {
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/[*#_`>-]/g, ''));
    u.rate = 0.95; u.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find(v => /female|zira|susan|natasha/i.test(v.name)) || voices.find(v => v.lang.startsWith('en')) || null;
    window.speechSynthesis.speak(u);
  } catch { /* no voice */ }
}

export default function Mbaza() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [weak, setWeak] = useState([]);
  const [stage, setStage] = useState('hello'); // hello | marks | ask | exercises
  const [msgs, setMsgs] = useState([]); // {who:'mbaza'|'you', text}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [quiz, setQuiz] = useState(null); // {questions, i, score, picked, done}
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/mbaza/weak-marks', token).then(d => setWeak(d.weak || [])).catch(() => {});
    const g = `Hello, welcome ${user?.name?.split(' ')[0] || 'student'}! I am MBAZA, your personal teacher when you are home.`;
    setMsgs([{ who: 'mbaza', text: g }]);
    say(g);
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, quiz]);

  const showMarks = () => {
    setStage('marks');
    const t = weak.length
      ? `Now let us see the marks you are failing in your teacher's quizzes. You tried, but you did not get 100% in ${weak.length} — see them below. We will fix them together.`
      : `Wonderful! You have no mark below 90% in your teacher's quizzes — keep it up!`;
    setMsgs(m => [...m, { who: 'mbaza', text: t }]);
    say(t);
  };

  const ask = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setMsgs(m => [...m, { who: 'you', text: q }]);
    setStage('ask');
    setBusy(true);
    const d = await api.post('/mbaza/ask', { question: q }, token).catch(() => ({ answer: 'Sorry — try again in a moment.' }));
    setBusy(false);
    setMsgs(m => [...m, { who: 'mbaza', text: d.answer }]);
    say(d.answer);
  };

  const doExercises = async (topic) => {
    setStage('exercises');
    setBusy(true);
    const d = await api.post('/mbaza/exercise', { topic: topic || 'general school revision' }, token).catch(() => ({ questions: [] }));
    setBusy(false);
    if (!d.questions?.length) {
      setMsgs(m => [...m, { who: 'mbaza', text: 'I could not prepare exercises right now — please ask me something first, then try again.' }]);
      return;
    }
    setQuiz({ questions: d.questions, i: 0, score: 0, picked: null, done: false });
    say('Here are your exercises. Answer each one, then I will mark you.');
  };

  const pick = (idx) => {
    setQuiz(qz => {
      if (!qz || qz.picked !== null) return qz;
      const right = idx === qz.questions[qz.i].answer;
      const score = qz.score + (right ? 1 : 0);
      const last = qz.i === qz.questions.length - 1;
      setTimeout(() => setQuiz(x => {
        if (!x) return x;
        if (last) {
          const final = `You scored ${score} out of ${x.questions.length}. ${score >= 4 ? 'Excellent work — I am proud of you!' : 'Good effort — ask me to explain the hard ones and try again!'}`;
          setMsgs(m => [...m, { who: 'mbaza', text: final }]);
          say(final);
          return { ...x, done: true };
        }
        return { ...x, i: x.i + 1, score, picked: null };
      }), 700);
      return { ...qz, score, picked: idx };
    });
  };

  const card = { background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, ${C.blue}15, ${C.yellow}12, ${C.green}12)`, paddingBottom: 40 }}>
      {/* Header with muse */}
      <div style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.green})`, color: '#fff', padding: '20px 18px 60px', textAlign: 'center', position: 'relative' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: 12, top: 16, background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>← Back</button>
        <div style={{ fontSize: 56, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.3))' }}>🎓</div>
        <h1 style={{ margin: '6px 0 2px', fontSize: 30, letterSpacing: 2 }}>MBAZA</h1>
        <div style={{ fontSize: 13, opacity: .9 }}>Your personal teacher at home — UClass</div>
      </div>

      <div style={{ maxWidth: 640, margin: '-40px auto 0', padding: '0 14px' }}>
        {/* Conversation */}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.who === 'you' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '85%', padding: '12px 15px', borderRadius: 16, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              background: m.who === 'you' ? C.green : '#fff', color: m.who === 'you' ? '#fff' : '#1e293b',
              borderBottomLeftRadius: m.who === 'you' ? 16 : 4, borderBottomRightRadius: m.who === 'you' ? 4 : 16,
              boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
              {m.who === 'mbaza' && <div style={{ fontSize: 11, fontWeight: 800, color: C.blue, marginBottom: 4 }}>🎓 MBAZA</div>}
              {m.text.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}
            </div>
          </div>
        ))}
        {busy && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>🎓 MBAZA is thinking…</div>}

        {/* Weak marks */}
        {stage === 'marks' && weak.length > 0 && (
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>📉 Marks below 90% — let's improve</div>
            {weak.map((w, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{w.title}</span>
                <span style={{ color: w.pct >= 60 ? '#b45309' : '#dc2626', fontWeight: 800 }}>{w.score}/{w.total} ({w.pct}%)</span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>Ask me: <i>"explain fractions"</i> or <i>"explain {weak[0]?.title?.split(' ').slice(0, 3).join(' ')}"</i> — I'll teach it like a real teacher, then give you exercises.</div>
          </div>
        )}

        {/* Quiz */}
        {quiz && (
          <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>✏️ Exercise {Math.min(quiz.i + 1, quiz.questions.length)}/{quiz.questions.length} — score {quiz.score}</div>
            {!quiz.done ? (() => {
              const q = quiz.questions[quiz.i];
              return (<>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>{q.q}</div>
                {q.options.map((o, i) => (
                  <button key={i} onClick={() => pick(i)} disabled={quiz.picked !== null}
                    style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, cursor: 'pointer',
                      background: quiz.picked === null ? '#fff' : i === q.answer ? '#dcfce7' : i === quiz.picked ? '#fee2e2' : '#fff',
                      borderColor: quiz.picked !== null && i === q.answer ? '#16a34a' : '#e2e8f0' }}>
                    {o}
                  </button>
                ))}
              </>);
            })() : (
              <div style={{ textAlign: 'center', padding: 10 }}>
                <div style={{ fontSize: 40 }}>{quiz.score >= 4 ? '🏆' : '💪'}</div>
                <div style={{ fontWeight: 800 }}>{quiz.score}/{quiz.questions.length} correct</div>
                <button onClick={() => setQuiz(null)} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Continue</button>
              </div>
            )}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {stage === 'hello' && <button onClick={showMarks} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: C.yellow, color: C.dark, fontWeight: 800, cursor: 'pointer' }}>📊 Show my weak marks</button>}
          <button onClick={() => doExercises(msgs.filter(m => m.who === 'you').slice(-1)[0]?.text)} disabled={busy} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: C.green, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>✏️ Do exercises</button>
        </div>

        {/* Ask input */}
        <div style={{ ...card, display: 'flex', gap: 8, position: 'sticky', bottom: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()}
            placeholder="Is there anything you want me to explain? e.g. explain long division"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14 }} />
          <button onClick={ask} disabled={busy} style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Ask</button>
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
