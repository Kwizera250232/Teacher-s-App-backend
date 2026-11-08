import { useNavigate } from 'react-router-dom';

// Teacher Connect → opens the UClass Alumni community (on the web app)
export default function TeacherConnect() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'linear-gradient(135deg,#0e7490,#0891b2)', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 15 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 19 }}>🎓 Teacher Connect — UClass Alumni</h1>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>Post, chat and explore with every teacher on UClass.</p>
        </div>
      </header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <a
          href="https://student.umunsi.com/alumni/feed"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', width: '100%', maxWidth: 420, background: 'linear-gradient(135deg,#667eea,#764ba2)', borderRadius: 18, padding: '26px 22px', color: '#fff', textDecoration: 'none', boxShadow: '0 8px 30px rgba(102,126,234,.35)', textAlign: 'center' }}
        >
          <div style={{ fontSize: 46, marginBottom: 10 }}>🎓</div>
          <div style={{ fontWeight: 800, fontSize: 19 }}>Open UClass Alumni Feed</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>Post, chat and explore with every teacher on UClass — tap to open the community →</div>
        </a>
      </div>
    </div>
  );
}
