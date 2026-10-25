import { useEffect, useRef, useState } from 'react';
import { api, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import VoiceCall from './VoiceCall';

const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23dc2626'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%93%9E%3C/text%3E%3C/svg%3E";

function useRingtone() {
  const ctxRef = useRef(null);
  const stop = () => { ctxRef.current?.close().catch(() => {}); ctxRef.current = null; };
  const start = () => {
    try {
      const ctx = ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 880;
      const t = ctx.currentTime;
      for (let i = 0; i < 60; i++) {
        gain.gain.setValueAtTime(0.0001, t + i * 1.4 + 0.9);
        gain.gain.exponentialRampToValueAtTime(0.25, t + i * 1.4 + 0.98);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 1.4 + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.25, t + i * 1.4 + 1.48);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 1.4 + 2.0);
        osc.frequency.setValueAtTime(880, t + i * 1.4 + 0.9);
        osc.frequency.setValueAtTime(660, t + i * 1.4 + 1.45);
      }
      osc.start(); osc.stop(t + 84);
    } catch { /* audio blocked */ }
  };
  return { start, stop };
}

/** Global watcher — rings on incoming staff calls even while doing something else in-app. */
export default function IncomingCallWatcher() {
  const { token, user } = useAuth();
  const staff = ['teacher', 'head_teacher', 'admin'].includes(user?.role);
  const [incoming, setIncoming] = useState(null);
  const [activeCall, setActiveCall] = useState(null); // { id, role, peerName, peerAvatar }
  const seenRef = useRef(new Set());
  const ringRef = useRef(useRingtone());
  const ring = ringRef.current;

  useEffect(() => {
    if (!staff || !token) return;
    const poll = async () => {
      const calls = await api.get('/teacher-calls/active', token).catch(() => []);
      const mine = calls.find((c) => c.status === 'ringing' && c.callee_id === user.id);
      if (mine && !seenRef.current.has(mine.id) && !activeCall) {
        seenRef.current.add(mine.id);
        setIncoming(mine);
        ring.start();
      }
      if (!mine) setIncoming((cur) => (cur ? (seenRef.current.delete(cur.id), ring.stop(), null) : cur));
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => { clearInterval(iv); ring.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, token, activeCall]);

  const accept = () => {
    ring.stop();
    setActiveCall({ id: incoming.id, role: 'callee', peerName: incoming.caller_name, peerAvatar: incoming.caller_avatar });
    setIncoming(null);
  };
  const decline = async () => {
    ring.stop();
    try { await api.post(`/teacher-calls/${incoming.id}/hangup`, { declined: true }, token); } catch { /* ok */ }
    setIncoming(null);
  };

  return (
    <>
      {incoming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.92)', zIndex: 2900, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <img src={incoming.caller_avatar ? `${UPLOADS_BASE}${incoming.caller_avatar}` : AV} alt="" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid #4ade80' }} />
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 14 }}>{incoming.caller_name}</div>
            <div style={{ fontSize: 14, opacity: .8, marginTop: 4 }}>📞 UClass call…</div>
            <div style={{ display: 'flex', gap: 40, justifyContent: 'center', marginTop: 36 }}>
              <button type="button" onClick={decline}
                style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', fontSize: 26, cursor: 'pointer', transform: 'rotate(135deg)' }}>📞</button>
              <button type="button" onClick={accept}
                style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', background: '#16a34a', color: '#fff', fontSize: 26, cursor: 'pointer', animation: 'ringPulse 1.4s ease-out infinite' }}>📞</button>
            </div>
          </div>
        </div>
      )}
      {activeCall && (
        <VoiceCall
          callId={activeCall.id}
          role={activeCall.role}
          peerName={activeCall.peerName}
          peerAvatar={activeCall.peerAvatar}
          onClose={() => setActiveCall(null)}
        />
      )}
    </>
  );
}

export { VoiceCall };
