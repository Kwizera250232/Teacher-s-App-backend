import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function StudentTextbooks() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/textbooks', token).catch(() => []),
      api.get('/textbooks/mine/progress', token).catch(() => []),
    ]).then(([b, p]) => {
      setBooks(Array.isArray(b) ? b : []);
      setProgress(Array.isArray(p) ? p : []);
      setLoading(false);
    });
  }, [token]);

  const bookProgress = (bookId) => {
    const rows = progress.filter((p) => p.textbook_id === bookId);
    const done = rows.filter((r) => r.kind === 'unit_test' && Number(r.pct) >= 50).length;
    const ex = rows.filter((r) => r.kind === 'exercise').length;
    const summative = rows.find((r) => r.kind === 'summative');
    return { done, ex, summative, attempts: rows.length };
  };

  const byGrade = books.reduce((acc, b) => {
    (acc[b.grade_level] = acc[b.grade_level] || []).push(b);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 15 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19 }}>📖 AI Textbooks</h1>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>Open a real book — read unit by unit, take exercises, pass the End-Unit test, then the Summative Assessment.</p>
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '18px 14px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Loading books…</p>
        ) : books.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>📚</div>
            <p>No textbooks yet. Check back soon.</p>
          </div>
        ) : (
          Object.keys(byGrade).sort().map((grade) => (
            <section key={grade} style={{ marginBottom: 26 }}>
              <h3 style={{ color: '#4f46e5', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>📘 {grade}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
                {byGrade[grade].map((b) => {
                  const pr = bookProgress(b.id);
                  return (
                    <Link key={b.id} to={`/student/textbooks/${b.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14,
                        padding: '14px 16px', transition: 'transform .12s, box-shadow .12s',
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(79,70,229,.12)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                      >
                        <div style={{ fontSize: 26 }}>{b.book_type === 'PB' ? '📗' : '📘'}</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', margin: '6px 0 2px' }}>{b.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          <span style={{ background: b.book_type === 'PB' ? '#dbeafe' : '#dcfce7', color: b.book_type === 'PB' ? '#1d4ed8' : '#15803d', borderRadius: 4, padding: '1px 6px', fontWeight: 600, marginRight: 5 }}>{b.book_type}</span>
                          {b.subject}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 8, color: '#7c3aed', fontWeight: 600 }}>
                          {pr.summative
                            ? `🎓 Summative done — ${Math.round(pr.summative.pct)}%`
                            : pr.done > 0
                              ? `🏆 ${pr.done} unit test${pr.done > 1 ? 's' : ''} passed`
                              : pr.ex > 0
                                ? `✏️ ${pr.ex} exercise${pr.ex > 1 ? 's' : ''} done`
                                : '▶ Start reading'}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
