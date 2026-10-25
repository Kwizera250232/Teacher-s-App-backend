import { useEffect, useRef, useState } from 'react';
import { api, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';

const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23667eea'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

/** Real in-app voice call (WebRTC peer-to-peer — no external app).
 *  role: 'caller' (starts) or 'callee' (answered). */
export default function VoiceCall({ callId, role, peerName, peerAvatar, onClose }) {
  const { token } = useAuth();
  const [status, setStatus] = useState(role === 'caller' ? 'Ringing…' : 'Connecting…');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const doneRef = useRef(false);
  const connectedRef = useRef(false);

  const end = async (declined = false) => {
    if (doneRef.current) return;
    doneRef.current = true;
    try { await api.post(`/teacher-calls/${callId}/hangup`, { declined }, token); } catch { /* ok */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    onClose?.();
  };

  useEffect(() => {
    let pollTimer;
    let cancelled = false;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) api.post(`/teacher-calls/${callId}/candidate`, { candidate: e.candidate.toJSON() }, token).catch(() => {});
    };
    pc.ontrack = (e) => {
      if (audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && !connectedRef.current) {
        connectedRef.current = true;
        setStatus('Connected');
        const t0 = Date.now();
        const iv = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 1000);
        setTimeout(() => clearInterval(iv), 4 * 3600 * 1000);
      }
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && connectedRef.current) end();
    };

    (async () => {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));
      } catch {
        setStatus('Microphone blocked — allow mic access and retry.');
        return;
      }

      if (role === 'caller') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await api.post(`/teacher-calls/${callId}/offer`, { sdp: offer.sdp }, token).catch(() => {});
      } else {
        // callee: fetch offer, answer
        const c = await api.get(`/teacher-calls/${callId}`, token).catch(() => null);
        if (c?.offer) {
          await pc.setRemoteDescription({ type: 'offer', sdp: c.offer });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await api.post(`/teacher-calls/${callId}/answer`, { sdp: answer.sdp }, token).catch(() => {});
        } else {
          setStatus('Call ended');
          setTimeout(() => onClose?.(), 1200);
          return;
        }
      }

      // Signaling poll — peer answer / ICE candidates / hangup
      const poll = async () => {
        if (cancelled || doneRef.current) return;
        const c = await api.get(`/teacher-calls/${callId}`, token).catch(() => null);
        if (!c || cancelled || doneRef.current) return;
        try {
          for (const cand of c.candidates || []) {
            if (cand) await pc.addIceCandidate(cand).catch(() => {});
          }
          if (role === 'caller' && c.answer && !pc.remoteDescription) {
            await pc.setRemoteDescription({ type: 'answer', sdp: c.answer });
            setStatus('Connecting…');
          }
        } catch { /* ok */ }
        if (['ended', 'declined', 'missed'].includes(c.status)) {
          doneRef.current = true;
          streamRef.current?.getTracks().forEach((t) => t.stop());
          pc.close();
          setStatus(c.status === 'declined' ? 'Declined' : c.status === 'missed' ? 'No answer' : 'Call ended');
          setTimeout(() => onClose?.(), 1400);
        }
      };
      poll();
      pollTimer = setInterval(poll, 400);
    })();

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      const wasDone = doneRef.current;
      doneRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pc.close();
      if (!wasDone) api.post(`/teacher-calls/${callId}/hangup`, {}, token).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#0f172a,#1e1b4b)', zIndex: 3000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <img
          src={peerAvatar ? `${UPLOADS_BASE}${peerAvatar}` : AV}
          alt=""
          style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,.25)' }}
        />
        {status === 'Ringing…' && (
          <span style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '3px solid #4ade80', opacity: .6, animation: 'ringPulse 1.4s ease-out infinite' }} />
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{peerName || 'Teacher'}</div>
      <div style={{ fontSize: 15, opacity: .8, marginTop: 6 }}>
        {connectedRef.current || status === 'Connected' ? `🔊 ${mm}:${ss}` : status}
      </div>
      <style>{'@keyframes ringPulse{0%{transform:scale(.9);opacity:.8}100%{transform:scale(1.5);opacity:0}}'}</style>

      <div style={{ display: 'flex', gap: 26, marginTop: 46 }}>
        <button
          type="button"
          onClick={() => {
            const t = streamRef.current?.getAudioTracks()[0];
            if (t) { t.enabled = !t.enabled; setMuted(!t.enabled); }
          }}
          style={{ width: 62, height: 62, borderRadius: '50%', border: 'none', fontSize: 24, cursor: 'pointer', background: muted ? '#f59e0b' : 'rgba(255,255,255,.15)', color: '#fff' }}
        >{muted ? '🔇' : '🎤'}</button>
        <button
          type="button"
          onClick={() => end()}
          style={{ width: 62, height: 62, borderRadius: '50%', border: 'none', fontSize: 24, cursor: 'pointer', background: '#dc2626', color: '#fff', transform: 'rotate(135deg)' }}
        >📞</button>
      </div>
    </div>
  );
}
