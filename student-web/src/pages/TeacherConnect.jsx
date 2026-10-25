import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import VoiceCall from '../components/VoiceCall';

const AV = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23667eea'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

export default function TeacherConnect() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [call, setCall] = useState(null); // { room, title }
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.get('/teachers', token).then(setTeachers).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return teachers;
    return teachers.filter((t) =>
      (t.name || '').toLowerCase().includes(s)
      || (t.school_name || '').toLowerCase().includes(s)
      || (t.email || '').toLowerCase().includes(s)
    );
  }, [teachers, q]);

  const startCall = async (t) => {
    setToast('');
    try {
      // Real in-app call — server rings their phone (push) and they answer in UClass
      const call = await api.post('/teacher-calls', { callee_id: t.id }, token);
      setCall({ id: call.id, peerName: t.name, peerAvatar: t.avatar_path });
    } catch (e) {
      setToast(e.message || 'Could not start the call.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: 'linear-gradient(135deg,#0e7490,#0891b2)', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 15 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19 }}>📞 Teacher Connect</h1>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>Call or message any teacher on UClass — your schoolmates are first.</p>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 14 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Search name, school or email…"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 15, boxSizing: 'border-box', marginBottom: 12 }}
        />

        {loading && <p style={{ textAlign: 'center', color: '#64748b' }}>Loading teachers…</p>}
        {!loading && list.length === 0 && <p style={{ textAlign: 'center', color: '#64748b' }}>No teachers found.</p>}
        {toast && <p style={{ color: '#b45309', fontSize: 13 }}>{toast}</p>}

        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((t) => (
            <div key={t.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.06)', flexWrap: 'wrap' }}>
              <img src={t.avatar_path ? `${UPLOADS_BASE}${t.avatar_path}` : AV} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 190 }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>
                  {t.name} {t.same_school && <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '1px 6px', marginLeft: 4, verticalAlign: 'middle' }}>SAME SCHOOL</span>}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t.role === 'head_teacher' ? '🏫 Head Teacher' : '👩‍🏫 Teacher'}{t.school_name ? ` · ${t.school_name}` : ''}</div>
                <div style={{ fontSize: 12.5, color: '#334155', marginTop: 3 }}>
                  <a href={`mailto:${t.email}`} style={{ color: '#0369a1', textDecoration: 'none' }}>✉️ {t.email}</a>
                  {t.phone && <span style={{ marginLeft: 10 }}>📱 <a href={`tel:${t.phone}`} style={{ color: '#0369a1', textDecoration: 'none' }}>{t.phone}</a></span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => startCall(t)}
                  title="In-app call"
                  style={{ background: '#dcfce7', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 15 }}
                >📞</button>
                <button
                  type="button"
                  onClick={() => navigate(`/messages?to=${t.id}`)}
                  title="Message"
                  style={{ background: '#e0e7ff', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 15 }}
                >💬</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {call && (
        <VoiceCall
          callId={call.id}
          role="caller"
          peerName={call.peerName}
          peerAvatar={call.peerAvatar}
          onClose={() => setCall(null)}
        />
      )}
    </div>
  );
}
