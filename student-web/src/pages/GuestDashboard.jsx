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

function attemptsByQuizId(attempts) {
  const map = new Map();
  for (const a of attempts || []) {
    const id = Number(a.quiz_id);
    if (!Number.isFinite(id)) continue;
    if (!map.has(id)) map.set(id, a);
  }
  return map;
}

/** Merge hub + per-class fetches; dedupe by quiz id. */
function normalizeQuizzes(rawList, classId, attemptMap) {
  const byId = new Map();
  for (const q of rawList || []) {
    if (q?.id == null) continue;
    const id = Number(q.id);
    if (!Number.isFinite(id)) continue;
    if (Number(q.class_id) !== Number(classId)) continue;
    const att = attemptMap.get(id);
    const attempted = Boolean(q.attempted || att);
    byId.set(id, {
      ...q,
      id,
      class_id: Number(classId),
      attempted,
      score: q.score ?? q.last_score ?? att?.score,
      total: q.total ?? q.last_total ?? att?.total,
      attempted_at: q.attempted_at ?? q.last_attempted_at ?? att?.attempted_at,
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.attempted !== b.attempted) return a.attempted ? 1 : -1;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

function guestQuizGroups(hub) {
  const attemptMap = attemptsByQuizId(hub?.attempts);
  const classMap = new Map();

  for (const cls of hub?.classes || []) {
    const classId = Number(cls.class_id);
    if (!Number.isFinite(classId)) continue;

    const raw = [
      ...(cls.quizzes || []),
      ...(hub?.all_quizzes || []).filter((q) => Number(q.class_id) === classId),
      ...(hub?.quizzes_pending || []).filter((q) => Number(q.class_id) === classId),
      ...(hub?.quizzes_completed || []).filter((q) => Number(q.class_id) === classId),
    ];

    const quizzes = normalizeQuizzes(raw, classId, attemptMap);
    if (quizzes.length === 0) continue;

    classMap.set(classId, {
      class_id: classId,
      class_name: cls.class_name,
      subject: cls.subject,
      teacher_name: cls.teacher_name,
      quizzes,
    });
  }

  return [...classMap.values()];
}

function QuizCard({ quiz, classId, onOpen }) {
  return (
    <div key={`${classId}-${quiz.id}`} className="item-card guest-quiz-card">
      <div className="item-card-body">
        <h3>❓ {quiz.title}</h3>
        {quiz.description && <p>{quiz.description}</p>}
        <div className="meta">
          {quiz.created_at ? `${new Date(quiz.created_at).toLocaleDateString()} · ` : ''}
          {quiz.attempted ? (
            <>
              <span className="guest-quiz-status guest-quiz-status--done">✓ Taken</span>
              {quiz.score != null && quiz.total != null && (
                <span className="guest-quiz-score">
                  {' '}
                  · Score {quiz.score}/{quiz.total}
                </span>
              )}
            </>
          ) : (
            <span className="guest-quiz-status guest-quiz-status--pending">Not taken yet</span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => onOpen(classId, quiz.id)}
      >
        {quiz.attempted ? 'View result' : 'Take Quiz'}
      </button>
    </div>
  );
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
    (async () => {
      try {
        const data = await api.get('/guest/hub', token);
        const classes = await Promise.all(
          (data.classes || []).map(async (cls) => {
            const expected = cls.counts?.quizzes || 0;
            const have = cls.quizzes?.length || 0;
            const needsFetch = expected === 0 ? have === 0 : have < expected;
            if (!needsFetch && have > 0) return cls;
            try {
              const fetched = await api.get(`/guest/classes/${cls.class_id}/quizzes`, token);
              return { ...cls, quizzes: fetched };
            } catch {
              return cls;
            }
          })
        );
        setHub({ ...data, classes });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const openQuiz = (classId, quizId) => {
    navigate(`/guest/classes/${classId}/quizzes/${quizId}`);
  };

  const quizGroups = guestQuizGroups(hub);
  const allQuizzes = quizGroups.flatMap((g) => g.quizzes);
  const pendingCount = allQuizzes.filter((q) => !q.attempted).length;
  const doneCount = allQuizzes.filter((q) => q.attempted).length;
  const totalQuizzes = allQuizzes.length;

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
                {pendingCount > 0 && `${pendingCount} to take`}
                {pendingCount > 0 && doneCount > 0 && ' · '}
                {doneCount > 0 && `${doneCount} completed`}
                {pendingCount === 0 && doneCount === 0 ? 'All quizzes for your shared classes' : ''}
              </p>

              {quizGroups.map((cls) => {
                const pending = cls.quizzes.filter((q) => !q.attempted);
                const done = cls.quizzes.filter((q) => q.attempted);
                return (
                  <div key={cls.class_id} className="guest-class-quizzes">
                    <h3 className="guest-class-quizzes__title">
                      {cls.class_name}
                      {cls.subject ? ` · ${cls.subject}` : ''}
                      <span className="guest-class-quizzes__teacher">{cls.teacher_name}</span>
                    </h3>

                    {pending.length > 0 && (
                      <div className="guest-quiz-subsection">
                        <h4 className="guest-quiz-subsection__title">To take ({pending.length})</h4>
                        <div className="guest-quiz-card-list">
                          {pending.map((q) => (
                            <QuizCard key={`${cls.class_id}-${q.id}`} quiz={q} classId={cls.class_id} onOpen={openQuiz} />
                          ))}
                        </div>
                      </div>
                    )}

                    {done.length > 0 && (
                      <div className="guest-quiz-subsection">
                        <h4 className="guest-quiz-subsection__title">Completed ({done.length})</h4>
                        <div className="guest-quiz-card-list">
                          {done.map((q) => (
                            <QuizCard key={`${cls.class_id}-${q.id}`} quiz={q} classId={cls.class_id} onOpen={openQuiz} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
