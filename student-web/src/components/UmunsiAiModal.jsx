import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function UmunsiAiModal({ classId, className, token, onClose, isTeacher = false }) {
  const navigate = useNavigate();
  const greeting = isTeacher
    ? `Muraho Mwarimu! Ndi Baza Umunsi Teacher AI 🤖\n\nNshobora gufasha:\n• Gusobanura amasomo n'ibitabo bya curriculum ya Rwanda\n• Gufasha gutegura homework na gusobanura abanyeshuri\n• Gukora ibibazo by'ikizamini\n\nBaza ikibazo cyangwa wandike homework kugira ngo ngusobanurire uko uyigisha!\n\nSubiza mu Kinyarwanda cyangwa English.`
    : `Muraho! Ndi Baza Umunsi Student AI 🤖\n\nNshobora gufasha mu bibazo bijyanye n'amasomo mwigwa muri ${className}.\n\nNibaze ikibazo!\n\nSubiza mu Kinyarwanda cyangwa English.`;
  const [messages, setMessages] = useState([
    { role: 'assistant', content: greeting },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notePanel, setNotePanel] = useState(null); // { title, content, saving, saved }
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, notePanel]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: 'user', content: text };
    const history = messages.slice(1);
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/ai/chat', {
        classId,
        message: text,
        history: history.map(m => ({ role: m.role, content: m.content })),
      }, token);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(err.message || 'Ntibishoboka gusubiza. Gerageza nanone.');
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

  const openNotePanel = (content) => {
    const title = content.split('\n')[0].slice(0, 80).trim() || 'AI Note';
    setNotePanel({ title, content, saving: false, saved: false });
  };

  const saveNote = async () => {
    if (!notePanel?.content?.trim()) return;
    setNotePanel(n => ({ ...n, saving: true }));
    try {
      await api.post('/student/notes', {
        title: notePanel.title.trim() || 'AI Note',
        content: notePanel.content,
        color: '#ede9fe',
      }, token);
      setNotePanel(n => ({ ...n, saving: false, saved: true }));
    } catch (_) {
      setNotePanel(n => ({ ...n, saving: false }));
    }
  };

  const SUBJECTS = ['📐 Math', '📖 English', '🌍 SST', '🔬 SET', '🇷🇼 Kinyarwanda', '🎨 Arts', '⚽ PES'];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,10,40,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes aiPop { from{opacity:0;transform:scale(0.9) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes aiBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-7px)} }
        @keyframes noteSlide { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .ai-note-pill:hover { background:#ede9fe !important; border-color:#a78bfa !important; }
        .ai-send-fab:hover:not(:disabled) { transform:scale(1.08); box-shadow:0 6px 20px rgba(79,70,229,0.5) !important; }
      `}</style>

      <div style={{
        background: '#fff',
        borderRadius: 26,
        width: '100%', maxWidth: 600,
        height: '90vh', maxHeight: 740,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 100px rgba(79,70,229,0.28), 0 4px 24px rgba(0,0,0,0.18)',
        animation: 'aiPop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        overflow: 'hidden',
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 40%, #7c3aed 100%)',
          padding: '20px 22px 0',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* decorative blobs */}
          <div style={{ position:'absolute', top:-30, right:20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.07)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', top:15, right:55, width:55, height:55, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', zIndex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{
                width:56, height:56, borderRadius:'50%',
                background:'rgba(255,255,255,0.15)',
                border:'2.5px solid rgba(255,255,255,0.35)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:28,
                boxShadow:'0 4px 16px rgba(0,0,0,0.25)',
              }}>🤖</div>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:17, letterSpacing:0.3, lineHeight:1.2 }}>
                  {isTeacher ? 'Baza Umunsi Teacher AI' : 'Baza Umunsi Student AI'}
                </div>
                <div style={{ color:'rgba(255,255,255,0.78)', fontSize:12.5, marginTop:3, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80', display:'inline-block' }} />
                  {className} · Online
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background:'rgba(255,255,255,0.15)', border:'1.5px solid rgba(255,255,255,0.3)',
                borderRadius:12, width:38, height:38, cursor:'pointer',
                color:'#fff', fontSize:17, display:'flex', alignItems:'center', justifyContent:'center',
                transition:'background 0.15s',
              }}
              title="Funga"
            >✕</button>
          </div>

          {/* Subject hint pills */}
          <div style={{ display:'flex', gap:6, marginTop:14, paddingBottom:14, flexWrap:'wrap', position:'relative', zIndex:1 }}>
            {SUBJECTS.map(s => (
              <span key={s} style={{
                background:'rgba(255,255,255,0.13)', border:'1px solid rgba(255,255,255,0.22)',
                borderRadius:20, padding:'3px 11px', fontSize:11.5, color:'rgba(255,255,255,0.92)',
                whiteSpace:'nowrap',
              }}>{s}</span>
            ))}
          </div>
        </div>

        {/* ── MESSAGES ── */}
        <div style={{
          flex:1, overflowY:'auto', padding:'18px 20px',
          display:'flex', flexDirection:'column', gap:16,
          background:'#f7f5ff',
        }}>
          {messages.map((msg, i) => (
            <div key={i}>
              <div style={{
                display:'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                alignItems:'flex-end', gap:10,
              }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    width:34, height:34, borderRadius:'50%',
                    background:'linear-gradient(135deg,#ede9fe,#ddd6fe)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:16, flexShrink:0,
                    boxShadow:'0 2px 8px rgba(124,58,237,0.2)',
                  }}>🤖</div>
                )}
                <div style={{
                  maxWidth:'74%',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                    : '#fff',
                  color: msg.role === 'user' ? '#fff' : '#1f2937',
                  borderRadius: msg.role === 'user' ? '22px 22px 6px 22px' : '22px 22px 22px 6px',
                  padding:'12px 17px',
                  fontSize:14, lineHeight:1.65,
                  whiteSpace:'pre-wrap', wordBreak:'break-word',
                  boxShadow: msg.role === 'user'
                    ? '0 4px 16px rgba(79,70,229,0.35)'
                    : '0 2px 12px rgba(0,0,0,0.09)',
                }}>
                  {msg.content}
                </div>
              </div>

              {/* Send to Note button — only for students on AI replies (not the greeting) */}
              {msg.role === 'assistant' && i > 0 && !isTeacher && (
                <div style={{ paddingLeft:44, marginTop:6 }}>
                  <button
                    className="ai-note-pill"
                    onClick={() => openNotePanel(msg.content)}
                    style={{
                      background:'#f5f3ff', border:'1.5px solid #c4b5fd',
                      borderRadius:20, padding:'4px 13px',
                      fontSize:12, color:'#6d28d9', cursor:'pointer',
                      fontWeight:600, display:'inline-flex', alignItems:'center', gap:5,
                      transition:'all 0.15s',
                    }}
                  >📝 Send to Note</button>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display:'flex', alignItems:'flex-end', gap:10 }}>
              <div style={{
                width:34, height:34, borderRadius:'50%',
                background:'linear-gradient(135deg,#ede9fe,#ddd6fe)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
              }}>🤖</div>
              <div style={{
                background:'#fff', borderRadius:'22px 22px 22px 6px',
                padding:'13px 20px', display:'flex', gap:6, alignItems:'center',
                boxShadow:'0 2px 12px rgba(0,0,0,0.09)',
              }}>
                {[0,1,2].map(d => (
                  <div key={d} style={{
                    width:9, height:9, borderRadius:'50%', background:'#a78bfa',
                    animation:'aiBounce 1.2s infinite', animationDelay:`${d*0.2}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background:'#fee2e2', color:'#dc2626', borderRadius:12,
              padding:'10px 16px', fontSize:13, textAlign:'center',
              border:'1px solid #fecaca',
            }}>{error}</div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── NOTE PANEL (students only) ── */}
        {notePanel && !isTeacher && (
          <div style={{
            borderTop:'2px solid #ede9fe',
            padding:'16px 20px',
            background:'#faf5ff',
            flexShrink:0,
            animation:'noteSlide 0.22s ease',
          }}>
            {notePanel.saved ? (
              <div>
                <div style={{
                  display:'flex', alignItems:'center', gap:10,
                  background:'#f0fdf4', border:'1.5px solid #86efac',
                  borderRadius:14, padding:'11px 16px', marginBottom:12,
                }}>
                  <span style={{ fontSize:20 }}>✅</span>
                  <div>
                    <div style={{ fontWeight:700, color:'#15803d', fontSize:13.5 }}>Note yabitswe neza!</div>
                    <div style={{ color:'#16a34a', fontSize:12, marginTop:2 }}>Usanga note zawe mu "📚 Amateka Yanjye"</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button
                    onClick={() => setNotePanel(n => ({ ...n, saved: false }))}
                    style={{
                      flex:1, minWidth:130, background:'#fff', border:'1.5px solid #c4b5fd',
                      borderRadius:11, padding:'9px 14px', fontSize:13, color:'#7c3aed',
                      cursor:'pointer', fontWeight:600,
                    }}
                  >✏️ Ongera wandike</button>
                  <button
                    onClick={() => setNotePanel({ title:'', content:'', saving:false, saved:false })}
                    style={{
                      flex:1, minWidth:130, background:'#fff', border:'1.5px solid #e5e7eb',
                      borderRadius:11, padding:'9px 14px', fontSize:13, color:'#374151',
                      cursor:'pointer', fontWeight:600,
                    }}
                  >📝 Note nshya</button>
                  <button
                    onClick={() => { onClose(); navigate('/student/notes'); }}
                    style={{
                      flex:1, minWidth:130,
                      background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
                      border:'none', borderRadius:11, padding:'9px 14px',
                      fontSize:13, color:'#fff', cursor:'pointer', fontWeight:700,
                    }}
                  >📚 Reba Notes Zanjye</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <span style={{ fontSize:17 }}>📝</span>
                    <span style={{ fontWeight:700, fontSize:13.5, color:'#4c1d95' }}>Bika kuri Note Yawe</span>
                  </div>
                  <button
                    onClick={() => setNotePanel(null)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:16, padding:3 }}
                  >✕</button>
                </div>
                <input
                  value={notePanel.title}
                  onChange={e => setNotePanel(n => ({ ...n, title: e.target.value }))}
                  placeholder="Injiza umutwe wa note..."
                  style={{
                    width:'100%', border:'1.5px solid #ddd6fe', borderRadius:10,
                    padding:'8px 13px', fontSize:13, fontWeight:600,
                    marginBottom:8, outline:'none', boxSizing:'border-box',
                    background:'#fff', color:'#1f2937', fontFamily:'inherit',
                  }}
                />
                <textarea
                  rows={3}
                  value={notePanel.content}
                  onChange={e => setNotePanel(n => ({ ...n, content: e.target.value }))}
                  placeholder="Inyandiko ya note..."
                  style={{
                    width:'100%', border:'1.5px solid #ddd6fe', borderRadius:10,
                    padding:'8px 13px', fontSize:13, resize:'vertical',
                    outline:'none', boxSizing:'border-box', fontFamily:'inherit',
                    lineHeight:1.55, background:'#fff', color:'#1f2937', minHeight:72,
                  }}
                />
                <button
                  onClick={saveNote}
                  disabled={notePanel.saving || !notePanel.content?.trim()}
                  style={{
                    marginTop:9, width:'100%',
                    background:(notePanel.saving || !notePanel.content?.trim())
                      ? '#e5e7eb' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                    color:(notePanel.saving || !notePanel.content?.trim()) ? '#9ca3af' : '#fff',
                    border:'none', borderRadius:11, padding:'11px',
                    fontSize:14, fontWeight:700,
                    cursor: notePanel.saving ? 'wait' : 'pointer',
                    transition:'all 0.15s',
                  }}
                >
                  {notePanel.saving ? 'Kubika...' : '💾 Bika Note'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── INPUT ── */}
        <div style={{
          padding:'14px 20px', borderTop:'1px solid #e9d5ff',
          display:'flex', gap:10, alignItems:'flex-end', flexShrink:0,
          background:'#fff',
        }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Andika ikibazo cy'isomo... (Enter = Ohereza)"
            disabled={loading}
            style={{
              flex:1, border:'2px solid #ddd6fe', borderRadius:18,
              padding:'11px 18px', fontSize:14, resize:'none',
              outline:'none', fontFamily:'inherit', lineHeight:1.45,
              maxHeight:110, overflowY:'auto',
              background: loading ? '#faf5ff' : '#fff',
              transition:'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor='#7c3aed'}
            onBlur={e => e.target.style.borderColor='#ddd6fe'}
          />
          <button
            className="ai-send-fab"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{
              width:48, height:48, borderRadius:'50%', border:'none',
              background:(!input.trim() || loading) ? '#e5e7eb' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
              color:(!input.trim() || loading) ? '#9ca3af' : '#fff',
              cursor:(!input.trim() || loading) ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:19, flexShrink:0,
              boxShadow:(!input.trim() || loading) ? 'none' : '0 4px 16px rgba(79,70,229,0.4)',
              transition:'all 0.18s',
            }}
          >➤</button>
        </div>
      </div>
    </div>
  );
}
