import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';
import { UPLOADS_BASE, api } from '../api';
import { useAuth } from '../context/AuthContext';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23667eea'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

function tryParse(val, fallback) {
  try { return JSON.parse(val) || fallback; } catch { return fallback; }
}

const COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

export default function ClassmateProfileModal({ person, onClose, onMessage }) {
  const { token, user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(!!person.i_subscribed);
  const [subCount, setSubCount] = useState(person.subscriber_count || 0);
  const [subLoading, setSubLoading] = useState(false);
  const [shares, setShares] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(false);

  function loadShares() {
    setSharesLoading(true);
    api.get(`/student-shares/user/${person.id}`, token)
      .then(setShares)
      .catch(() => setShares([]))
      .finally(() => setSharesLoading(false));
  }

  useEffect(() => {
    setLoading(true);
    api.get(`/profile/${person.id}`, token)
      .then(data => {
        setProfileData(data);
        setSubscribed(!!data.i_subscribed);
        setSubCount(data.subscriber_count || 0);
        if (data.i_subscribed || user?.role === 'teacher') loadShares();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [person.id]);

  async function toggleSubscribe() {
    if (subLoading) return;
    setSubLoading(true);
    try {
      const res = await api.post(`/profile/${person.id}/subscribe`, {}, token);
      setSubscribed(res.subscribed);
      setSubCount(res.subscriber_count);
      if (res.subscribed) {
        const full = await api.get(`/profile/${person.id}`, token);
        setProfileData(full);
        loadShares();
      } else {
        setShares([]);
      }
    } catch (e) { console.error('Subscribe error:', e); }
    finally { setSubLoading(false); }
  }

  const p = profileData || person;
  const schools = tryParse(p.schools, []);
  const favLessons = tryParse(p.favorite_lessons, []);
  const hobbies = tryParse(p.hobbies, []);
  const initials = person.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const bg = COLORS[(parseInt(person.id) || 0) % COLORS.length];
  const avatarSrc = p.avatar_path ? `${UPLOADS_BASE}${p.avatar_path}` : DEFAULT_AVATAR;

  const modal = (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:99999,display:'flex',alignItems:'flex-end',justifyContent:'center',fontFamily:'inherit' }}>
      <div style={{ background:'#fff',width:'100%',maxWidth:480,maxHeight:'90vh',borderRadius:'24px 24px 0 0',overflowY:'auto',overscrollBehavior:'contain',boxShadow:'0 -8px 40px rgba(0,0,0,0.2)',position:'relative' }}>

        <button onClick={onClose} style={{ position:'absolute',top:14,right:16,background:'#f1f5f9',border:'none',borderRadius:'50%',width:34,height:34,fontSize:18,cursor:'pointer',color:'#475569',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10 }}>&times;</button>

        {loading && <div style={{ textAlign:'center',padding:'60px 20px',color:'#94a3b8',fontSize:14 }}>Loading profile...</div>}

        {!loading && !subscribed && (
          <div style={{ padding:'48px 24px 36px',textAlign:'center' }}>
            <img src={avatarSrc} alt={person.name} onError={(e)=>{e.target.onerror=null;e.target.src=DEFAULT_AVATAR;}} style={{ width:88,height:88,borderRadius:'50%',objectFit:'cover',border:'4px solid #fff',boxShadow:'0 4px 18px rgba(0,0,0,0.15)',marginBottom:14 }} />
            <div style={{ fontSize:20,fontWeight:800,color:'#1e293b',marginBottom:6 }}>{person.name}</div>
            <span style={{ display:'inline-block',padding:'3px 14px',borderRadius:20,fontSize:12,fontWeight:700,textTransform:'capitalize',background:person.role==='teacher'?'#d1fae5':'#e0e7ff',color:person.role==='teacher'?'#065f46':'#3730a3',marginBottom:20 }}>{person.role}</span>
            <div style={{ background:'#fef9ec',border:'1.5px solid #fde68a',borderRadius:14,padding:'16px 20px',marginBottom:24,fontSize:14,color:'#92400e',lineHeight:1.6 }}>
              🔒 Subscribe to <strong>{person.name}</strong> to view their full profile.
            </div>
            <button onClick={toggleSubscribe} disabled={subLoading} style={{ width:'100%',padding:'14px',borderRadius:12,background:'linear-gradient(135deg,#f59e0b,#d97706)',color:'#fff',border:'none',fontWeight:700,fontSize:16,cursor:subLoading?'not-allowed':'pointer',opacity:subLoading?0.75:1,marginBottom:12 }}>
              {subLoading ? 'Subscribing...' : `\u2795 Subscribe \u00b7 ${subCount} subscribers`}
            </button>
            <button onClick={onClose} style={{ width:'100%',padding:'12px',borderRadius:12,background:'#f1f5f9',color:'#374151',border:'none',fontWeight:700,fontSize:15,cursor:'pointer' }}>Close</button>
          </div>
        )}

        {!loading && subscribed && (
          <>
            <div style={{ textAlign:'center',padding:'36px 24px 20px',background:'linear-gradient(160deg,rgba(102,126,234,0.06) 0%,rgba(118,75,162,0.06) 100%)',borderBottom:'1px solid #f1f5f9' }}>
              <img src={avatarSrc} alt={person.name} onError={(e)=>{e.target.onerror=null;e.target.src=DEFAULT_AVATAR;}} style={{ width:96,height:96,borderRadius:'50%',objectFit:'cover',border:'4px solid #fff',boxShadow:'0 4px 18px rgba(0,0,0,0.15)',marginBottom:12 }} />
              <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,flexWrap:'wrap',marginBottom:6 }}>
                <span style={{ fontSize:20,fontWeight:800,color:'#1e293b' }}>{person.name}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1d9bf0"/><path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ display:'inline-block',padding:'3px 14px',borderRadius:20,fontSize:12,fontWeight:700,textTransform:'capitalize',background:person.role==='teacher'?'#d1fae5':'#e0e7ff',color:person.role==='teacher'?'#065f46':'#3730a3',marginBottom:6 }}>{person.role}</span>
              {p.email && <div style={{ fontSize:13,color:'#64748b',marginTop:6 }}>{'\u2709\uFE0F'} {p.email}</div>}
              <div style={{ display:'flex',justifyContent:'center',gap:24,marginTop:14,marginBottom:2 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20,fontWeight:800,color:'#5c6bc0',lineHeight:1 }}>{subCount}</div>
                  <div style={{ fontSize:11,color:'#94a3b8',fontWeight:600,marginTop:2 }}>Subscribers</div>
                </div>
              </div>
            </div>

            <div style={{ padding:'0 20px 4px' }}>
              {(p.phone || p.home_address || schools.length > 0) && (
                <div style={{ padding:'16px 0',borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.6px',color:'#667eea',marginBottom:10 }}>📋 Personal Info</div>
                  {p.phone && <div style={{ display:'flex',gap:10,marginBottom:8,fontSize:14,color:'#374151' }}><span>📞</span><span>{p.phone}</span></div>}
                  {p.home_address && <div style={{ display:'flex',gap:10,marginBottom:8,fontSize:14,color:'#374151' }}><span>🏠</span><span>{p.home_address}</span></div>}
                  {schools.length > 0 && (
                    <div style={{ display:'flex',gap:10,alignItems:'flex-start',fontSize:14,color:'#374151' }}>
                      <span>🏫</span>
                      <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                        {schools.map((s,i) => <span key={i} style={{ background:'#e0e7ff',color:'#3730a3',borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600 }}>{s}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(p.dreams || favLessons.length > 0 || hobbies.length > 0 || p.fears) && (
                <div style={{ padding:'16px 0',borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.6px',color:'#667eea',marginBottom:10 }}>✨ About Me</div>
                  {p.dreams && (<div style={{ marginBottom:10 }}><div style={{ fontSize:12,fontWeight:700,color:'#64748b',marginBottom:4 }}>🌟 Dreams</div><p style={{ margin:0,fontSize:14,color:'#374151',lineHeight:1.5 }}>{p.dreams}</p></div>)}
                  {favLessons.length > 0 && (<div style={{ marginBottom:10 }}><div style={{ fontSize:12,fontWeight:700,color:'#64748b',marginBottom:4 }}>📚 Favorite Lessons</div><div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>{favLessons.map((l,i) => <span key={i} style={{ background:'#e0e7ff',color:'#3730a3',borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600 }}>{l}</span>)}</div></div>)}
                  {hobbies.length > 0 && (<div style={{ marginBottom:10 }}><div style={{ fontSize:12,fontWeight:700,color:'#64748b',marginBottom:4 }}>🎯 Hobbies</div><div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>{hobbies.map((h,i) => <span key={i} style={{ background:'#e0e7ff',color:'#3730a3',borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600 }}>{h}</span>)}</div></div>)}
                  {p.fears && (<div style={{ marginBottom:10 }}><div style={{ fontSize:12,fontWeight:700,color:'#64748b',marginBottom:4 }}>😰 What I Fear</div><p style={{ margin:0,fontSize:14,color:'#374151',lineHeight:1.5 }}>{p.fears}</p></div>)}
                </div>
              )}

              {!(p.dreams || favLessons.length > 0 || hobbies.length > 0 || p.phone || schools.length > 0) && (
                <p style={{ textAlign:'center',color:'#aaa',padding:'24px 0',fontSize:14 }}>This person hasn't filled their profile yet.</p>
              )}

              {/* Written Compositions */}
              <div style={{ padding:'16px 0' }}>
                <div style={{ fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'.6px',color:'#667eea',marginBottom:12 }}>✍️ Written Compositions</div>
                {sharesLoading && <p style={{ fontSize:13,color:'#94a3b8',textAlign:'center',padding:'12px 0' }}>Loading…</p>}
                {!sharesLoading && shares.length === 0 && (
                  <p style={{ fontSize:13,color:'#94a3b8',textAlign:'center',padding:'12px 0' }}>No compositions published yet.</p>
                )}
                {!sharesLoading && shares.map(s => {
                  const CATS = { lesson: { emoji:'📚',color:'#2563eb',bg:'#dbeafe',label:'Lesson' }, dream: { emoji:'🌟',color:'#7c3aed',bg:'#ede9fe',label:'Dream' }, motivation: { emoji:'🔥',color:'#ea580c',bg:'#ffedd5',label:'Motivation' } };
                  const cat = CATS[s.type] || CATS.lesson;
                  const lines = s.content.split('\n');
                  const postTitle = lines[0]?.replace('📌 ', '') || '';
                  const sections = [];
                  let cur = null, buf = [];
                  for (const l of lines.slice(1)) {
                    if (l === '📖 Introduction' || l === '📝 Body' || l === '🏁 Conclusion') {
                      if (cur) sections.push({ label: cur, text: buf.join('\n').trim() });
                      cur = l; buf = [];
                    } else { buf.push(l); }
                  }
                  if (cur) sections.push({ label: cur, text: buf.join('\n').trim() });
                  return (
                    <div key={s.id} style={{ background:'#f8fafc',borderRadius:12,padding:'14px 16px',marginBottom:12,borderLeft:`4px solid ${cat.color}` }}>
                      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
                        <span style={{ background:cat.bg,color:cat.color,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700 }}>{cat.emoji} {cat.label}</span>
                        <span style={{ fontSize:11,color:'#94a3b8' }}>{(() => { const d=(Date.now()-new Date(s.created_at))/1000; if(d<60) return 'just now'; if(d<3600) return `${Math.floor(d/60)}m ago`; if(d<86400) return `${Math.floor(d/3600)}h ago`; return new Date(s.created_at).toLocaleDateString(); })()}</span>
                      </div>
                      <div style={{ fontWeight:700,fontSize:15,color:'#1e293b',marginBottom:10 }}>{postTitle}</div>
                      {sections.map((sec, si) => (
                        <div key={si} style={{ marginBottom:8 }}>
                          <div style={{ fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:3 }}>{sec.label.replace(/^[^ ]+ /,'')}</div>
                          <p style={{ margin:0,fontSize:13,color:'#374151',lineHeight:1.6,whiteSpace:'pre-wrap' }}>{sec.text}</p>
                        </div>
                      ))}
                      {(s.school || s.class_name || s.teacher_name) && (
                        <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginTop:8 }}>
                          {s.school && <span style={{ fontSize:11,color:'#64748b' }}>🏫 {s.school}</span>}
                          {s.class_name && <span style={{ fontSize:11,color:'#64748b' }}>🎓 {s.class_name}</span>}
                          {s.teacher_name && <span style={{ fontSize:11,color:'#64748b' }}>👨‍🏫 {s.teacher_name}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:10,padding:'16px 20px 32px',borderTop:'1px solid #f1f5f9' }}>
              <button onClick={toggleSubscribe} disabled={subLoading} style={{ width:'100%',padding:'13px',borderRadius:12,background:subscribed?'linear-gradient(135deg,#10b981,#059669)':'linear-gradient(135deg,#f59e0b,#d97706)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:subLoading?'not-allowed':'pointer',opacity:subLoading?0.75:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'opacity 0.2s' }}>
                {subscribed ? '\u2705 Subscribed' : '\u2795 Subscribe'}
                <span style={{ fontWeight:500,fontSize:13,opacity:0.9 }}>{'\u00b7'} {subCount} subscribers</span>
              </button>
              <div style={{ display:'flex',gap:10 }}>
                {onMessage && (
                  <button onClick={() => onMessage(person.id)} style={{ flex:1,padding:'12px',borderRadius:12,background:'linear-gradient(135deg,#667eea,#764ba2)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer' }}>💬 Send Message</button>
                )}
                <button onClick={onClose} style={{ flex:1,padding:'12px',borderRadius:12,background:'#f1f5f9',color:'#374151',border:'none',fontWeight:700,fontSize:15,cursor:'pointer' }}>Close</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
