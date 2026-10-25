import { useEffect } from 'react';

/** In-app voice/video call — opens the shared UClass room in an embedded Jitsi frame.
 *  Both participants join the same room name → they talk directly in the app. */
export default function CallModal({ room, title = 'UClass Call', onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!room) return null;
  const url = `https://meet.jit.si/${room}#config.prejoinPageEnabled=false&config.startAudioOnly=false`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', color: '#fff', background: '#1e293b' }}>
        <span style={{ fontWeight: 700 }}>📞 {title}</span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, cursor: 'pointer' }}
        >
          End call
        </button>
      </div>
      <iframe
        src={url}
        title="UClass call"
        allow="camera; microphone; display-capture; autoplay; clipboard-write"
        style={{ flex: 1, border: 'none', width: '100%' }}
      />
    </div>
  );
}

/** Deterministic room name for two users so caller & receiver join the same call. */
export const callRoom = (a, b) => `uclass-call-${Math.min(a, b)}-${Math.max(a, b)}`;

/** Marker embedded in the auto call-invite message. */
export const CALL_MSG = (room) => `📞 UClass voice/video call — tap "Join the call" to talk now.\n[uclass.call:${room}]`;
export const parseCallRoom = (text) => String(text || '').match(/\[uclass\.call:([a-z0-9-]+)\]/i)?.[1] || null;
