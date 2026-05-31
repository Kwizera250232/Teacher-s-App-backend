import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

export default function DeanAiModal({ token, onClose }) {
  const greeting = `Hi! I'm Dean 🤖 — your UClass app assistant.\n\nI know everything about how UClass works:\n• Features for teachers, students & admins\n• How to join/create classes\n• Quizzes, homework, compositions, leaderboards\n• The composition scoring criteria\n• How to install the app & much more!\n\nAsk me anything about UClass!`;

  const [messages, setMessages] = useState([{ role: 'assistant', content: greeting }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const history = messages.slice(1);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/ai/dean', {
        message: text,
        history: history.map(m => ({ role: m.role, content: m.content })),
      }, token);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(err.message || 'Could not get a response. Please try again.');
      setMessages(prev => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const QUICK = [
    'What can students do?',
    'How do I join a class?',
    'How are compositions scored?',
    'What does a teacher do?',
    'How to install the app?',
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,10,30,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes deanPop { from{opacity:0;transform:scale(0.9) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes deanBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        .dean-quick:hover { background:#e0e7ff !important; }
      `}</style>

      <div style={{
        background: '#fff', borderRadius: 26, width: '100%', maxWidth: 580,
        height: '90vh', maxHeight: 720,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        animation: 'deanPop 0.3s cubic-bezier(.34,1.56,.64,1) both',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          padding: '18px 20px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>🤖</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>Dean</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Our AI Support</div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
            width: 34, height: 34, cursor: 'pointer', color: '#fff', fontSize: 18, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              {m.role === 'assistant' && (
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, flexShrink: 0, marginRight: 8, marginTop: 2,
                }}>🤖</div>
              )}
              <div style={{
                maxWidth: '76%',
                background: m.role === 'user'
                  ? 'linear-gradient(135deg,#4f46e5,#7c3aed)'
                  : '#f1f5f9',
                color: m.role === 'user' ? '#fff' : '#1e293b',
                borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                padding: '10px 14px',
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}>🤖</div>
              <div style={{ background: '#f1f5f9', borderRadius: '18px 18px 18px 4px', padding: '10px 16px', display: 'flex', gap: 5 }}>
                {[0,1,2].map(j => (
                  <span key={j} style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                    background: '#7c3aed', animation: `deanBounce 1.2s ${j*0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          {error && <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', padding: '4px 0' }}>{error}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        {messages.length === 1 && (
          <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK.map((q, i) => (
              <button key={i} className="dean-quick"
                onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{
                  background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20,
                  padding: '5px 12px', fontSize: 12, color: '#4f46e5', cursor: 'pointer',
                  fontWeight: 600, transition: 'background 0.15s',
                }}>{q}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '10px 16px 14px',
          borderTop: '1px solid #e2e8f0',
          flexShrink: 0,
        }}>
          <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask Dean about UClass..."
              style={{
                flex: 1, resize: 'none', border: '1.5px solid #c7d2fe',
                borderRadius: 14, padding: '10px 14px', fontSize: 14,
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.4,
                maxHeight: 120, overflowY: 'auto',
                background: '#f8fafc', color: '#1e293b',
              }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                color: '#fff', fontSize: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'transform 0.15s, box-shadow 0.15s',
                opacity: loading || !input.trim() ? 0.5 : 1,
                boxShadow: '0 4px 14px rgba(79,70,229,0.4)',
              }}
            >➤</button>
          </form>
        </div>
      </div>
    </div>
  );
}
