import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

/**
 * Teacher earnings card for the dashboard.
 * Shows 70% share of class subscription payments, withdraw button
 * (min 4,000 RWF) via MTN MoMo disbursement, and payment history.
 */
export default function TeacherEarningsCard({ token }) {
  const { user } = useAuth();
  const canViewEarnings = user?.role === 'teacher' || user?.role === 'head_teacher';
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [msg, setMsg] = useState('');
  const [hidden, setHidden] = useState(() => localStorage.getItem('teacherEarningsHidden') === '1');

  const toggleHidden = () => {
    setHidden((h) => {
      localStorage.setItem('teacherEarningsHidden', h ? '0' : '1');
      return !h;
    });
  };

  const load = async () => {
    try {
      const d = await api.get('/teacher/earnings', token);
      setData(d);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (canViewEarnings) load();
  }, [canViewEarnings]);

  const withdraw = async () => {
    setMsg('');
    if (!phone.trim()) { setMsg('Enter your MTN number'); return; }
    const amt = amount.trim() ? Number(amount) : data.available;
    if (!Number.isFinite(amt) || amt < data.withdraw_min) {
      setMsg(`Amount must be at least ${data.withdraw_min.toLocaleString()} RWF`);
      return;
    }
    if (amt > data.available) {
      setMsg(`You can withdraw up to ${data.available.toLocaleString()} RWF`);
      return;
    }
    setWithdrawing(true);
    try {
      const r = await api.post('/teacher/withdraw', { phone: phone.trim(), amount: amt }, token);
      setMsg(`✓ ${r.message} (${r.amount?.toLocaleString()} RWF)`);
      setAmount('');
      load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setWithdrawing(false);
    }
  };

  if (!canViewEarnings || !data) return null;
  const canWithdraw = data.available >= data.withdraw_min;

  const eyeBtn = (
    <button
      type="button"
      onClick={toggleHidden}
      title={hidden ? 'Show earnings' : 'Hide earnings'}
      aria-label={hidden ? 'Show earnings card' : 'Hide earnings card'}
      style={{
        border: 'none', borderRadius: 8, cursor: 'pointer', padding: '6px 9px',
        background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, lineHeight: 1,
      }}
    >
      {hidden ? '👁' : '🙈'}
    </button>
  );

  if (hidden) {
    return (
      <div style={{
        background: 'linear-gradient(135deg,#064e3b,#047857)', borderRadius: 12,
        padding: '8px 14px', color: '#fff', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <span style={{ fontSize: 13, opacity: 0.85 }}>💰 My Earnings hidden</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>•••••• RWF</span>
          {eyeBtn}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg,#064e3b,#047857)', borderRadius: 16,
      padding: 20, color: '#fff', marginBottom: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            💰 My Earnings (70% share) {eyeBtn}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{data.available.toLocaleString()} <span style={{ fontSize: 15, fontWeight: 600 }}>RWF</span></div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            Collected: {data.total_collected.toLocaleString()} RWF · Withdrawn: {data.withdrawn.toLocaleString()} RWF
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: canWithdraw ? '#ffcc00' : 'rgba(255,255,255,0.2)',
              color: canWithdraw ? '#1e1e1e' : '#fff', fontWeight: 800, fontSize: 14,
            }}
          >
            Withdraw
          </button>
        </div>
      </div>

      {!canWithdraw && (
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
          Minimum withdrawal: {data.withdraw_min.toLocaleString()} RWF
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 14 }}>
          {canWithdraw ? (
            <>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.9 }}>
                Withdraw all {data.available.toLocaleString()} RWF, or enter an amount (min {data.withdraw_min.toLocaleString()} RWF)
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="number" min={data.withdraw_min} max={data.available} step="100"
                  placeholder={`${data.available} (all)`} value={amount}
                  onChange={e => setAmount(e.target.value)}
                  style={{ flex: '1 1 120px', padding: '10px 12px', borderRadius: 8, border: 'none', fontSize: 14, color: '#111' }}
                />
                <input
                  type="tel" placeholder="MTN number 0781234567" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  style={{ flex: '2 1 160px', padding: '10px 12px', borderRadius: 8, border: 'none', fontSize: 14, color: '#111' }}
                />
                <button onClick={withdraw} disabled={withdrawing}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#ffcc00', fontWeight: 800, cursor: withdrawing ? 'not-allowed' : 'pointer', color: '#1e1e1e' }}>
                  {withdrawing ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
              Keep going! You need {Math.max(0, data.withdraw_min - data.available).toLocaleString()} RWF more to withdraw.
            </p>
          )}
          {msg && <p style={{ margin: '10px 0 0', fontSize: 13, color: msg.startsWith('✓') ? '#86efac' : '#fca5a5' }}>{msg}</p>}

          {/* History */}
          {(data.withdrawals?.length > 0 || data.recent_payments?.length > 0) && (
            <div style={{ marginTop: 14, fontSize: 12 }}>
              {data.withdrawals?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, opacity: 0.9 }}>Withdrawals</div>
                  {data.withdrawals.map(w => (
                    <div key={w.id} style={{ display: 'flex', gap: 8, opacity: 0.85, padding: '2px 0' }}>
                      <span style={{ flex: 1 }}>{w.amount.toLocaleString()} RWF → {w.phone}</span>
                      <span>{w.status}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.recent_payments?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4, opacity: 0.9 }}>Recent payments</div>
                  {data.recent_payments.slice(0, 5).map(p => (
                    <div key={p.id} style={{ display: 'flex', gap: 8, opacity: 0.85, padding: '2px 0' }}>
                      <span style={{ flex: 1 }}>{p.student_name} — {p.class_name}</span>
                      <span>+{p.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
