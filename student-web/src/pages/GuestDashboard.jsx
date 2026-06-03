import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import GuestShell from '../components/GuestShell';
import GuestUpgradeModal from '../components/GuestUpgradeModal';
import './Dashboard.css';
import './GuestDashboard.css';
import '../components/GuestUpgradeModal.css';
import TutorialVideo from '../components/TutorialVideo';

function quizzesForClass(cls) {
  if (Array.isArray(cls.quizzes) && cls.quizzes.length > 0) return cls.quizzes;
  return [];
}

function guestQuizGroups(hub) {
  const fromClasses = (hub?.classes || [])
    .map((cls) => ({
      class_id: cls.class_id,
      class_name: cls.class_name,
      subject: cls.subject,
      teacher_name: cls.teacher_name,
      quizzes: quizzesForClass(cls),
    }))
    .filter((g) => g.quizzes.length > 0);

  if (fromClasses.length > 0) return fromClasses;

  const flat = [...(hub?.quizzes_pending || []), ...(hub?.quizzes_completed || [])];
  if (flat.length === 0) return [];

  const byClass = new Map();
  for (const q of flat) {
    const key = q.class_id;
    if (!byClass.has(key)) {
      byClass.set(key, {
        class_id: q.class_id,
        class_name: q.class_name,
        subject: null,
        teacher_name: q.teacher_name,
        quizzes: [],
      });
    }
    byClass.get(key).quizzes.push(q);
  }
  return [...byClass.values()];
}

export default function GuestDashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [hub, setHub] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .get('/guest/hub', token)
      .then(async (data) => {
        const needsQuizFetch = (data.classes || []).some(
          (cls) => !cls.quizzes?.length && (cls.counts?.quizzes || 0) > 0
        );
        if (!needsQuizFetch) {
          setHub(data);
          return;
        }
        const classes = await Promise.all(
          (data.classes || []).map(async (cls) => {
            if (cls.quizzes?.length) return cls;
            try {
              const quizzes = await api.get(`/guest/classes/${cls.class_id}/quizzes`, token);
              return { ...cls, quizzes };
            } catch {
              return cls;
            }
          })
        );
        setHub({ ...data, classes });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const openQuiz = (classId, quizId) => {
    navigate(`/guest/classes/${classId}/quizzes/${quizId}`);
  };

  const quizGroups = guestQuizGroups(hub);
  const totalQuizzes = quizGroups.reduce((n, g) => n + g.quizzes.length, 0);

  return (
    <GuestShell title="Guest home">
      <TutorialVideo
        compact
        title="How to use UClass (video)"
        subtitle="Guest signup, shared quizzes & class materials"
      />
      <div className="guest-limits-banner">
        <strong>Guest mode — limited access</strong>
        <ul>
          <li>✅ Take quizzes, view announcements, notes & homework from shared classes</li>
          <li>❌ No class roster, leaderboard, discussions, or homework submission</li>
          <li>❌ Not visible as a enrolled student to your teacher</li>
        </ul>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

      {!loading && hub && (
        <>
          {hub.quiz_access_note && (
            <p
              style={{
                fontSize: 13,
                color: '#065f46',
                fontWeight: 600,
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 16,
              }}
            >
              {hub.quiz_access_note}
            </p>
          )}

          {totalQuizzes > 0 && (
            <section className="guest-quiz-section guest-quiz-section--cards">
              <h2>❓ Quizzes ({totalQuizzes})</h2>
              <p className="guest-quiz-section__hint">
                Same list as in each class — tap Take Quiz to start without opening the class first.
              </p>
              {quizGroups.map((cls) => (
                <div key={cls.class_id} className="guest-class-quizzes">
                  <h3 className="guest-class-quizzes__title">
                    {cls.class_name}
                    {cls.subject ? ` · ${cls.subject}` : ''}
                    <span className="guest-class-quizzes__teacher">{cls.teacher_name}</span>
                  </h3>
                  {cls.quizzes.map((q) => (
                    <div key={q.id} className="item-card">
                      <div className="item-card-body">
                        <h3>❓ {q.title}</h3>
                        {q.description && <p>{q.description}</p>}
                        <div className="meta">
                          {q.created_at
                            ? new Date(q.created_at).toLocaleDateString()
                            : null}
                          {q.created_at ? ' · ' : ''}
                          {q.attempted ? '✓ Already taken' : 'Not taken yet'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => openQuiz(cls.class_id, q.id)}
                      >
                        {q.attempted ? 'View result' : 'Take Quiz'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          <h2 style={{ fontSize: 17, marginTop: 24, marginBottom: 12 }}>Classes from shared links</h2>
          {hub.classes.length === 0 ? (
            <p style={{ color: '#64748b' }}>
              Open a quiz share link from a teacher to unlock classes here.
            </p>
          ) : (
            <div className="guest-class-grid">
              {hub.classes.map((cls) => (
                <div key={cls.class_id} className="guest-class-card">
                  <h3>{cls.class_name}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                    {cls.subject ? `${cls.subject} · ` : ''}
                    {cls.teacher_name}
                  </p>
                  <div className="guest-pill-row">
                    <span className="guest-pill">📢 {cls.counts?.announcements || 0}</span>
                    <span className="guest-pill">📄 {cls.counts?.notes || 0}</span>
                    <span className="guest-pill">📝 {cls.counts?.homework || 0}</span>
                    <span className="guest-pill">❓ {cls.counts?.quizzes || 0}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 12 }}
                    onClick={() => navigate(`/guest/classes/${cls.class_id}`)}
                  >
                    Open class →
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="guest-upgrade-cta">
            <p>
              <strong>Are you a teacher or student?</strong> Upgrade your account to unlock the full dashboard
              and keep your quiz scores.
            </p>
            <button type="button" className="btn btn-full" onClick={() => setShowUpgrade(true)}>
              Upgrade account →
            </button>
          </div>
        </>
      )}

      <GuestUpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </GuestShell>
  );
}
