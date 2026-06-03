import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DonateSupportBanner from '../components/DonateSupportBanner';
import TutorialVideo, { TutorialVideoDownloadLink } from '../components/TutorialVideo';
import LandingRoleSignup from '../components/LandingRoleSignup';

export default function Landing() {
  const navigate = useNavigate();
  const codeInputRef = useRef(null);
  const [classCode, setClassCode] = useState('');
  const [deanInput, setDeanInput] = useState('');
  const [deanLoading, setDeanLoading] = useState(false);
  const [deanOpen, setDeanOpen] = useState(false);
  const deanBottomRef = useRef(null);
  const deanInputRef = useRef(null);
  const [deanMessages, setDeanMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm Dean 🎓 of student.umunsi.com — what can I help you today?\n\nI can explain:\n• Student and teacher login/signup\n• Join class with code\n• Quizzes, homework, and notes\n• Parent benefits and support\n• Full app overview (student, teacher, admin)"
    }
  ]);

  const handleJoinWithCode = () => {
    const cleanCode = classCode.trim().toUpperCase();
    if (!cleanCode) {
      codeInputRef.current?.focus();
      return;
    }
    navigate(`/join?code=${encodeURIComponent(cleanCode)}`);
  };

  const getDeanReply = (question) => {
    const q = question.toLowerCase();
    const hasAny = (...terms) => terms.some((term) => q.includes(term));

    if (hasAny('login', 'log in', 'sign in', 'signin', 'signup', 'sign up', 'register', 'account')) {
      if (hasAny('student')) {
        return 'For Student account:\n1. Open student.umunsi.com and tap Sign in or Join a Class.\n2. If new, choose student signup and create name, email, password.\n3. If already registered, sign in with email and password.\n4. After login, use class code to join and start learning.';
      }
      if (hasAny('teacher')) {
        return 'For Teacher account:\n1. Open student.umunsi.com and choose Start as Teacher / Sign up.\n2. Create account details and school profile.\n3. After login, create class, get class code, and share with students.\n4. Use dashboard for notes, homework, quizzes, and progress tracking.';
      }
      return 'Login / Signup guide:\n• Students: create account or sign in, then join class with code.\n• Teachers: create teacher account, then create class and share code.\n• Returning users: tap Sign in and use your registered email + password.';
    }

    if (hasAny('join class', 'class code', 'join', 'code')) {
      return 'How to join a class:\n1. Tap Join Class.\n2. Enter the 6-character class code from your teacher.\n3. Sign up or login as a student.\n4. You are added instantly and can access announcements, notes, homework, quizzes, and discussion.';
    }
    if (hasAny('quiz', 'quizzes', 'auto grade', 'auto graded', 'score', 'test')) {
      return 'Quiz system:\n• Teachers create quizzes with questions, options, answers, and time limits.\n• Students take quizzes on phone or desktop.\n• The app auto grades objective questions instantly.\n• Results appear fast for both teacher and student.';
    }
    if (hasAny('homework', 'assignment', 'due')) {
      return 'Homework workflow:\n• Teachers post homework with due date and instructions.\n• Students view and submit their work.\n• Teachers review and grade submissions.\n• Parents can monitor pending and completed homework at home.';
    }
    if (hasAny('notes', 'lesson notes', 'materials', 'download')) {
      return 'Notes and materials:\n• Teachers create notes and upload learning files.\n• Students open and download notes anytime from class tabs.\n• This helps revision at school and at home.';
    }
    if (hasAny('parent', 'parents', 'home support', 'benefit')) {
      return 'Parent benefits:\n• See child progress and activity updates.\n• Follow homework and quiz performance.\n• Receive teacher communication and guidance.\n• Support children to learn better at home.';
    }
    if (hasAny('teacher', 'teach', 'class management')) {
      return 'Teacher features:\n• Create classes and share class code.\n• Post announcements and lesson notes.\n• Assign and grade homework.\n• Create quizzes and view results.\n• Track student progress in one dashboard.';
    }
    if (hasAny('student', 'learn', 'classmate', 'discussion')) {
      return 'Student features:\n• Join class with code.\n• Do quizzes and receive quick feedback.\n• Submit homework and get notes.\n• Interact with teachers and classmates about lessons and activities.\n• Follow class updates from one place.';
    }

    if (hasAny('admin', 'school', 'manage users')) {
      return 'Admin overview:\n• Manage schools, teachers, students, and classes.\n• Monitor platform usage and reports.\n• Support quality learning at school level.';
    }

    if (hasAny('install', 'app', 'phone', 'pwa')) {
      return 'You can install UClass on phone like an app:\n1. Open student.umunsi.com in browser.\n2. Tap Install / Add to Home Screen when prompted.\n3. Launch UClass directly from your phone home screen.';
    }

    if (hasAny('everything', 'overview', 'all features', 'about', 'what can', 'platform')) {
      return 'UClass full overview:\n• Students: join class, do quizzes, submit homework, get notes, and discuss lessons.\n• Teachers: create classes, notes, homework, quizzes, announcements, and track results.\n• Parents: follow child progress and support learning at home.\n• Admins: manage schools, users, and platform settings.\n\nIf you want, ask me one area and I will explain it step-by-step.';
    }

    return 'Great question. I can explain login/signup, class joining, quizzes, homework, notes, parent benefits, teacher tools, and full app overview. Try asking: "How does student signup work?" or "Explain all teacher features."';
  };

  const askDean = () => {
    const text = deanInput.trim();
    if (!text || deanLoading) return;
    setDeanMessages((prev) => [...prev, { role: 'user', content: text }]);
    setDeanInput('');
    setDeanLoading(true);
    setTimeout(() => {
      setDeanMessages((prev) => [...prev, { role: 'assistant', content: getDeanReply(text) }]);
      setDeanLoading(false);
      setTimeout(() => deanBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }, 450);
  };

  const openDean = () => {
    setDeanOpen(true);
    setTimeout(() => {
      deanBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      deanInputRef.current?.focus();
    }, 80);
  };

  const studentFeatures = useMemo(() => ([
    {
      title: 'STUDENT JOIN CLASS',
      text: 'Students join class first using a class code, then unlock lessons and class activities in one tap.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
          <path d="M5 4h14a1 1 0 0 1 1 1v14l-4-2-4 2-4-2-4 2V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      image: '/images/landing/656642666_1404974461657878_6540421227514327794_n.jpg',
      tint: 'from-indigo-100 to-violet-100'
    },
    {
      title: 'Do Quiz, Homework, Get Notes',
      text: 'Students do quizzes, submit homework, and get notes with auto grading feedback from teachers.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
          <path d="M8 10h8M8 14h5M6 3h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      image: '/images/landing/651284765_1401530122002312_2963162434047218533_n.jpg',
      tint: 'from-violet-100 to-fuchsia-100'
    },
    {
      title: 'Interact with Teacher & Classmates',
      text: 'Interact with teacher and classmates about lessons and class activities through class discussions.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
          <path d="M7 8h10M7 12h6m6 7-4-2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1v2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      image: '/images/landing/678338657_1434981345323856_6442929879255025444_n.jpg',
      tint: 'from-blue-100 to-indigo-100'
    }
  ]), []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#eef1ff] via-[#f7f5ff] to-[#efeaff] text-slate-900">

      {/* ── Floating Dean AI bubble (always visible, like WhatsApp Meta AI) ── */}
      <div
        style={{ position: 'fixed', bottom: 24, right: 20, zIndex: 9999 }}
        className="flex flex-col items-end gap-2"
      >
        {/* tooltip label — visible when chat is closed */}
        {!deanOpen && (
          <div
            style={{
              background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
              color: '#fff',
              borderRadius: 20,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              boxShadow: '0 4px 18px rgba(79,70,229,0.45)',
              whiteSpace: 'nowrap',
              animation: 'deanFadeIn 0.4s ease both',
            }}
          >
            Ask Dean AI · Chat ✨
          </div>
        )}

        {/* fab button */}
        <button
          onClick={() => (deanOpen ? setDeanOpen(false) : openDean())}
          aria-label="Open Dean AI"
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 6px 28px rgba(79,70,229,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            transition: 'transform 0.18s, box-shadow 0.18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {deanOpen ? '✕' : '🎓'}
        </button>
      </div>

      {/* ── Dean AI full chat panel ── */}
      {deanOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 96,
            right: 16,
            zIndex: 9998,
            width: 'calc(100vw - 32px)',
            maxWidth: 380,
            height: 520,
            background: '#fff',
            borderRadius: 24,
            boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'deanSlideUp 0.28s cubic-bezier(.34,1.56,.64,1) both',
          }}
        >
          <style>{`
            @keyframes deanFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
            @keyframes deanSlideUp { from{opacity:0;transform:translateY(30px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
            @keyframes deanDot { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
          `}</style>

          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎓</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>Dean</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>UClass App Assistant</div>
            </div>
            <button onClick={() => setDeanOpen(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deanMessages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginRight: 7, marginTop: 2 }}>🎓</div>
                )}
                <div style={{ maxWidth: '78%', background: msg.role === 'user' ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : '#f1f5f9', color: msg.role === 'user' ? '#fff' : '#1e293b', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '9px 13px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {deanLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🤖</div>
                <div style={{ background: '#f1f5f9', borderRadius: '16px 16px 16px 4px', padding: '9px 14px', display: 'flex', gap: 4 }}>
                  {[0,1,2].map(j => (<span key={j} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', animation: `deanDot 1.2s ${j*0.2}s infinite` }} />))}
                </div>
              </div>
            )}
            <div ref={deanBottomRef} />
          </div>

          {/* Quick prompts */}
          {deanMessages.length === 1 && (
            <div style={{ padding: '0 12px 6px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {['How does student signup work?', 'How does teacher signup work?', 'How do quizzes and homework work?', 'Give me full app overview'].map((q) => (
                <button key={q} onClick={() => { setDeanInput(q); setTimeout(() => deanInputRef.current?.focus(), 30); }} style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 16, padding: '4px 10px', fontSize: 11, color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }}>{q}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <input
                ref={deanInputRef}
                type="text"
                value={deanInput}
                onChange={e => setDeanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); askDean(); } }}
                placeholder="Ask Dean about UClass..."
                style={{ flex: 1, border: '1.5px solid #c7d2fe', borderRadius: 12, padding: '9px 13px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#f8fafc', color: '#1e293b' }}
                disabled={deanLoading}
              />
              <button
                onClick={askDean}
                disabled={deanLoading || !deanInput.trim()}
                style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: deanLoading || !deanInput.trim() ? 0.45 : 1, boxShadow: '0 3px 12px rgba(79,70,229,0.4)', flexShrink: 0 }}
              >➤</button>
            </div>
          </div>
        </div>
      )}
      <div className="uclass-page-shell w-full max-w-none px-4 pb-20 pt-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <header className="mb-10 flex items-center justify-between rounded-2xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-indigo-100 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none" role="img" aria-label="graduation cap">🎓</span>
            <p className="font-heading text-xl font-black tracking-tight text-indigo-700">UClass</p>
          </div>
          <button
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            onClick={() => navigate('/login')}
          >
            Sign in
          </button>
        </header>

        <DonateSupportBanner />

        <TutorialVideo
          className="landing-page"
          wideFull
          title="How to use UClass — video guide"
          subtitle="1080p · Google search, role signup (teacher, student, guest), Dean AI, classes, notes, homework & activity. Personal details are blurred for privacy."
        />
        <TutorialVideoDownloadLink />

        <section className="grid animate-fade-up gap-8 rounded-3xl bg-white p-6 shadow-xl shadow-indigo-100 ring-1 ring-indigo-100 md:grid-cols-2 md:items-center md:p-10">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-violet-700">Built for Learning</p>
            <h1 className="font-heading text-3xl font-black leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
              One education app for students, teachers, and parents in Rwanda.
            </h1>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5">
              <img
                src="/images/landing/rwanda-flag.png"
                alt="Rwanda flag"
                className="h-4 w-6 rounded-sm object-cover ring-1 ring-slate-200"
              />
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Rwanda</span>
            </div>
            <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
              Student join class with a code, do quiz, submit homework, get notes, and interact with teachers and classmates. Develop your writing skills with your parents and Teacher.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => navigate('/register?role=teacher')}
                className="rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700"
              >
                Start as Teacher
              </button>
              <button
                onClick={() => navigate('/join')}
                className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
              >
                Join a Class
              </button>
            </div>
            <div className="mt-5 max-w-md rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Student Join Class</p>
              <div className="mt-2 flex gap-2">
                <input
                  ref={codeInputRef}
                  type="text"
                  placeholder="Enter class code"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleJoinWithCode();
                    }
                  }}
                  className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-indigo-300 placeholder:text-slate-400 focus:ring-2"
                  aria-label="Class code"
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={handleJoinWithCode}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-6 -top-6 hidden h-24 w-24 rounded-full bg-violet-200/60 blur-xl sm:block" />
            <img
              src="/images/landing/656642666_1404974461657878_6540421227514327794_n.jpg"
              alt="Students doing class activity"
              className="h-72 w-full rounded-3xl object-cover shadow-2xl shadow-indigo-100 sm:h-80 lg:h-96"
            />
            <div className="absolute -bottom-5 left-4 rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-violet-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Today</p>
              <p className="text-sm font-bold text-slate-800">4 homework tasks completed</p>
            </div>
          </div>
        </section>

        <LandingRoleSignup />

        <section className="mt-16 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">Student Features</p>
              <h2 className="font-heading mt-2 text-2xl font-black text-slate-900 sm:text-3xl">Everything students need to stay on track</h2>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {studentFeatures.map((feature) => (
              <article key={feature.title} className="overflow-hidden rounded-3xl bg-white shadow-lg shadow-slate-100 ring-1 ring-slate-100 transition hover:-translate-y-1">
                <img src={feature.image} alt={feature.title} className="h-40 w-full object-cover" />
                <div className={`bg-gradient-to-r ${feature.tint} p-5`}>
                  <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-indigo-600 shadow-sm">{feature.icon}</div>
                  <h3 className="font-heading text-lg font-bold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-700">{feature.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid animate-fade-up gap-6 rounded-3xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-6 text-white shadow-xl shadow-indigo-200 md:grid-cols-2 md:p-10" style={{ animationDelay: '220ms' }}>
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-100">For Teachers</p>
            <h2 className="font-heading text-3xl font-black leading-tight">Plan faster. Teach smarter. Grade in minutes.</h2>
            <p className="max-w-md text-indigo-50">
              Build lessons, create notes, assign homework, launch quizzes, and track mastery without juggling spreadsheets.
            </p>
            <ul className="space-y-2 text-sm text-indigo-50">
              <li>Auto grading for quizzes and objective homework</li>
              <li>Create Notes and share learning materials quickly</li>
              <li>Simple class code enrollment and progress analytics</li>
            </ul>
            <button
              onClick={() => navigate('/register?role=teacher')}
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              Create Teacher Account
            </button>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/20">
            <img
              src="/images/landing/651284765_1401530122002312_2963162434047218533_n.jpg"
              alt="Teacher and students doing practical class projects"
              className="h-full min-h-64 w-full rounded-2xl object-cover"
            />
          </div>
        </section>

        <section className="mt-16 grid animate-fade-up gap-8 rounded-3xl bg-white p-6 shadow-xl shadow-indigo-100 ring-1 ring-indigo-100 md:grid-cols-2 md:items-center md:p-10" style={{ animationDelay: '320ms' }}>
          <div className="order-2 md:order-1">
            <img
              src="/images/landing/678338657_1434981345323856_6442929879255025444_n.jpg"
              alt="Children learning with practical activities"
              className="h-72 w-full rounded-3xl object-cover"
            />
          </div>
          <div className="order-1 md:order-2">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">For Parents</p>
            <h2 className="font-heading mt-2 text-3xl font-black text-slate-900">Stay connected to your child&apos;s growth</h2>
            <p className="mt-3 text-slate-600">
              Parents receive updates on homework, quiz performance, and teacher feedback, and help children to learn well when home through our app.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-violet-50 p-3">Weekly activity snapshots and attendance trends</div>
              <div className="rounded-2xl bg-indigo-50 p-3">Instant alerts for missing homework and low quiz scores</div>
              <div className="rounded-2xl bg-blue-50 p-3">Secure messaging with teachers</div>
            </div>
          </div>
        </section>

        <section className="mt-16 grid animate-fade-up items-center gap-8 md:grid-cols-2" style={{ animationDelay: '400ms' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600">App Preview</p>
            <h2 className="font-heading mt-2 text-3xl font-black text-slate-900">A mobile experience students actually enjoy</h2>
            <p className="mt-3 text-slate-600">
              From classroom feed to assignment details, every screen is designed for clarity on small devices.
            </p>
          </div>

          {/* Phone mockup — realistic class screenshot */}
          <div className="mx-auto flex justify-center">
            <div className="relative w-[270px] rounded-[2.6rem] bg-slate-900 p-[3px] shadow-2xl shadow-slate-400 ring-4 ring-slate-800 sm:w-[290px] overflow-hidden">
              {/* notch */}
              <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-slate-900" />
              {/* screen */}
              <div className="h-[620px] w-full overflow-hidden rounded-[2.4rem] bg-[#f1f3f9] sm:h-[640px]">
                {/* status bar */}
                <div className="flex items-center justify-between bg-white px-4 pt-6 pb-1 text-[9px] text-slate-400">
                  <span>9:41</span>
                  <span className="flex gap-1">▲ WiFi 🔋</span>
                </div>

                {/* app top bar */}
                <div className="flex items-center justify-between bg-white px-3 py-2 shadow-sm">
                  <button className="text-[10px] text-sky-600 font-medium">← Back</button>
                  <span className="text-[11px] font-black text-sky-700">🎓 UClass</span>
                </div>

                {/* class hero banner */}
                <div className="mx-3 mt-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-3 text-white">
                  <p className="text-sm font-black">P6 A</p>
                  <p className="text-[10px] text-purple-200">📘 Languages</p>
                  {/* class code intentionally hidden */}
                  <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1">
                    <span className="text-[9px] font-semibold tracking-widest text-white/70 blur-[3px] select-none">LKGAY5</span>
                  </div>
                </div>

                {/* tab bar */}
                <div className="mx-3 mt-2 flex gap-1 overflow-x-auto rounded-xl bg-white px-2 py-1 shadow-sm text-[8px] font-semibold text-slate-500 whitespace-nowrap">
                  <span className="rounded-lg bg-indigo-600 px-2 py-1 text-white">Announcements</span>
                  <span className="px-2 py-1">Notes</span>
                  <span className="px-2 py-1">Homework</span>
                  <span className="px-2 py-1">Quizzes</span>
                  <span className="px-2 py-1">Discussion</span>
                </div>

                {/* announcement card */}
                <div className="mx-3 mt-2 rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[9px] text-slate-400">📢 4/30/2026, 8:03 PM</p>
                  <p className="mt-1 text-[10px] text-slate-700 leading-snug">Keep practicing writing Composition through your profile. View Homework and download work there.</p>
                </div>

                {/* quiz done card */}
                <div className="mx-3 mt-2 rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-semibold text-indigo-600">Quiz Done · Math</p>
                      <p className="text-[11px] font-bold text-slate-900">Fractions Challenge</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">80%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-indigo-100">
                    <div className="h-1.5 w-4/5 rounded-full bg-indigo-500" />
                  </div>
                  <p className="mt-1 text-[9px] font-medium text-emerald-600">✅ Auto graded</p>
                </div>

                {/* homework due — Science */}
                <div className="mx-3 mt-2 rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] text-slate-400">Homework Due · Science</p>
                      <p className="text-[11px] font-bold text-slate-900">Science Reflection</p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">Due</span>
                  </div>
                </div>

                {/* homework due — Languages */}
                <div className="mx-3 mt-2 rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] text-slate-400">Homework Due · Languages</p>
                      <p className="text-[11px] font-bold text-slate-900">Composition Practice</p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold text-violet-700">Due</span>
                  </div>
                </div>

                {/* bottom nav */}
                <div className="absolute bottom-3 left-3 right-3 flex justify-around rounded-2xl bg-white py-2 shadow-md text-[8px] text-slate-500">
                  <span className="flex flex-col items-center gap-0.5"><span>🏠</span>Home</span>
                  <span className="flex flex-col items-center gap-0.5 text-indigo-600 font-semibold"><span>📚</span>Class</span>
                  <span className="flex flex-col items-center gap-0.5"><span>📝</span>Notes</span>
                  <span className="flex flex-col items-center gap-0.5"><span>👤</span>Profile</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CEO Quote */}
        <section className="mt-16 animate-fade-up" style={{ animationDelay: '460ms' }}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-900 p-8 shadow-2xl sm:p-10">
            {/* decorative large quote mark */}
            <span className="pointer-events-none absolute -top-4 left-6 select-none text-[120px] font-black leading-none text-white/5">&ldquo;</span>

            <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
              {/* photo — half width on mobile, fixed on desktop */}
              <div className="w-1/2 flex-shrink-0 sm:w-32">
                <img
                  src="/images/landing/ceo.jpg"
                  alt="Kwizera Jean de Dieu — CEO &amp; Founder"
                  className="h-auto w-full rounded-2xl object-cover shadow-lg ring-4 ring-sky-500/30"
                />
              </div>

              {/* quote text */}
              <div className="flex flex-col justify-center">
                <p className="text-lg font-semibold leading-relaxed text-white sm:text-xl">
                  &ldquo;<a href="https://student.umunsi.com" target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200 transition-colors">Student Umunsi</a> was created to help teachers manage learning more easily, give students faster feedback, and keep parents connected.&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-px w-8 rounded bg-indigo-400" />
                  <div>
                    <p className="text-sm font-bold text-indigo-300">Kwizera Jean de Dieu</p>
                    <p className="text-xs text-slate-400">CEO &amp; Founder, UClass</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16 animate-fade-up rounded-3xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-8 text-white shadow-xl shadow-indigo-200 sm:p-10" style={{ animationDelay: '500ms' }}>
          <h2 className="font-heading text-3xl font-black leading-tight sm:text-4xl">Ready to transform learning for your whole school?</h2>
          <p className="mt-3 max-w-2xl text-indigo-50">
            Launch in minutes with class codes, homework workflows, and quiz auto grading built in.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => navigate('/register?role=teacher')}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              Get Started Free
            </button>
            <button
              onClick={() => navigate('/login')}
              className="rounded-full border border-white/70 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              I already have an account
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
