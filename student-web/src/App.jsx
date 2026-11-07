import { Suspense, lazy, Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import TeacherDashboard from './pages/TeacherDashboard';
import HeadTeacherDashboard from './pages/HeadTeacherDashboard';
const ParentHub = lazy(() => import('./pages/ParentHub'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));
import StudentDashboard from './pages/StudentDashboard';
import { dashboardPath } from './utils/roles';
const TeacherClassPage = lazy(() => import('./pages/TeacherClassPage'));
const RecordCatMarks = lazy(() => import('./pages/RecordCatMarks'));
const StudentClassPage = lazy(() => import('./pages/StudentClassPage'));
const TakeQuiz = lazy(() => import('./pages/TakeQuiz'));
const TakeGroupQuiz = lazy(() => import('./pages/TakeGroupQuiz'));
const StudentQuizReportsPage = lazy(() => import('./pages/StudentQuizReportsPage'));
const StudentTextbooks = lazy(() => import('./pages/StudentTextbooks'));
const TeacherConnect = lazy(() => import('./pages/TeacherConnect'));
const TeacherLibrary = lazy(() => import('./pages/TeacherLibrary'));
const TeacherPublicProfile = lazy(() => import('./pages/TeacherPublicProfile'));
const TextbookReader = lazy(() => import('./pages/TextbookReader'));
const QuizResults = lazy(() => import('./pages/QuizResults'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
import JoinClass from './pages/JoinClass';
import StudentNotes from './pages/StudentNotes';
const ClassMomentsPage = lazy(() => import('./pages/ClassMomentsPage'));
const ShareMomentPage = lazy(() => import('./pages/ShareMomentPage'));
const QuizShareLanding = lazy(() => import('./pages/QuizShareLanding'));
const GuestDashboard = lazy(() => import('./pages/GuestDashboard'));
const GuestClassPage = lazy(() => import('./pages/GuestClassPage'));
const GuestProfile = lazy(() => import('./pages/GuestProfile'));
import InviteSignup from './pages/InviteSignup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
const Profile = lazy(() => import('./pages/Profile'));
const Messages = lazy(() => import('./pages/Messages'));
import Footer from './components/Footer';
import OfflineBanner from './components/OfflineBanner';
import IncomingCallWatcher from './components/IncomingCallWatcher';
import { InstallProvider } from './components/InstallPrompt';
import { usePushNotifications } from './hooks/usePushNotifications';
import './components/Footer.css';
import './styles/WaAppShell.css';
import './styles/WaChatShell.css';
import './styles/AppFullscreen.css';

// If a lazy page chunk fails after an app update (stale cached index.html),
// reload once so the fresh bundle is fetched instead of showing a white screen.
class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch() {
    const last = Number(sessionStorage.getItem('app_reload_ts') || 0);
    if (Date.now() - last > 30000) {
      sessionStorage.setItem('app_reload_ts', String(Date.now()));
      window.location.reload();
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#475569', marginBottom: 12 }}>Something went wrong loading this page.</p>
          <button
            type="button"
            onClick={() => { sessionStorage.removeItem('app_reload_ts'); window.location.reload(); }}
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 700 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (role && ![].concat(role).includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/welcome" replace />;
  return <Navigate to={dashboardPath(user.role)} replace />;
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();
  usePushNotifications(token);
  const hideFooter = /\/messages(\/|$)|\/parent\/dashboard|\/guest\//.test(location.pathname);
  const chatFullscreen = /\/messages(\/|$)|\/guest\//.test(location.pathname);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const handler = (event) => {
      if (event.data?.type === 'OPEN_URL' && event.data.url) {
        navigate(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);

  return (
    <div className={`app-wa-shell${chatFullscreen ? ' app-wa-shell--chat-fullscreen' : ''}`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <OfflineBanner />
      <IncomingCallWatcher />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AppErrorBoundary>
        <Suspense fallback={<div className="app-route-loading" style={{padding:40,textAlign:'center'}}>Loading…</div>}>
        <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/welcome" element={<Landing />} />
                <Route path="/join" element={<JoinClass />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/invite" element={<InviteSignup />} />
                <Route path="/share/moment/:token" element={<ShareMomentPage />} />
                <Route path="/quiz/share/:token" element={<QuizShareLanding />} />

                <Route path="/guest/dashboard" element={
                  <ProtectedRoute role="guest"><GuestDashboard /></ProtectedRoute>
                } />
                <Route path="/guest/profile" element={
                  <ProtectedRoute role="guest"><GuestProfile /></ProtectedRoute>
                } />
                <Route path="/guest/classes/:classId" element={
                  <ProtectedRoute role="guest"><GuestClassPage /></ProtectedRoute>
                } />
                <Route path="/guest/classes/:classId/quizzes/:quizId" element={
                  <ProtectedRoute role="guest"><TakeQuiz /></ProtectedRoute>
                } />

                <Route path="/admin" element={
                  <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
                } />

                <Route path="/head-teacher/dashboard" element={
                  <ProtectedRoute role="head_teacher"><HeadTeacherDashboard /></ProtectedRoute>
                } />
                <Route path="/head-teacher/classes/:id" element={
                  <ProtectedRoute role="head_teacher"><TeacherClassPage /></ProtectedRoute>
                } />
                <Route path="/head-teacher/classes/:id/record-marks" element={
                  <ProtectedRoute role="head_teacher"><RecordCatMarks /></ProtectedRoute>
                } />
                <Route path="/head-teacher/classes/:classId/quizzes/:quizId/results" element={
                  <ProtectedRoute role="head_teacher"><QuizResults /></ProtectedRoute>
                } />

                <Route path="/teacher/dashboard" element={
                  <ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>
                } />
                <Route path="/teacher/classes/:id" element={
                  <ProtectedRoute role="teacher"><TeacherClassPage /></ProtectedRoute>
                } />
                <Route path="/teacher/classes/:id/record-marks" element={
                  <ProtectedRoute role="teacher"><RecordCatMarks /></ProtectedRoute>
                } />
                <Route path="/teacher/classes/:classId/quizzes/:quizId/results" element={
                  <ProtectedRoute role="teacher"><QuizResults /></ProtectedRoute>
                } />

                <Route path="/parent/dashboard" element={
                  <ProtectedRoute role="parent"><ParentHub /></ProtectedRoute>
                } />
                <Route path="/parent/legacy" element={
                  <ProtectedRoute role="parent"><ParentDashboard /></ProtectedRoute>
                } />
                <Route path="/parent/class-moments" element={
                  <ProtectedRoute role="parent"><ClassMomentsPage backPath="/parent/dashboard" /></ProtectedRoute>
                } />
                <Route path="/parent/class-moments/:id" element={
                  <ProtectedRoute role="parent"><ClassMomentsPage backPath="/parent/dashboard" /></ProtectedRoute>
                } />

                <Route path="/student/dashboard" element={
                  <ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>
                } />
                <Route path="/student/classes/:id" element={
                  <ProtectedRoute role="student"><StudentClassPage /></ProtectedRoute>
                } />
                <Route path="/student/classes/:classId/quizzes/:quizId" element={
                  <ProtectedRoute role="student"><TakeQuiz /></ProtectedRoute>
                } />
                <Route path="/student/classes/:classId/group-quizzes/:assignmentId" element={
                  <ProtectedRoute role="student"><TakeGroupQuiz /></ProtectedRoute>
                } />
                <Route path="/student/notes" element={
                  <ProtectedRoute role="student"><StudentNotes /></ProtectedRoute>
                } />
                <Route path="/student/quiz-reports" element={
                  <ProtectedRoute role="student"><StudentQuizReportsPage /></ProtectedRoute>
                } />
                <Route path="/student/textbooks" element={
                  <ProtectedRoute role="student"><StudentTextbooks /></ProtectedRoute>
                } />
                <Route path="/student/textbooks/:id" element={
                  <ProtectedRoute role="student"><TextbookReader /></ProtectedRoute>
                } />
                <Route path="/teacher-profile/:id" element={
                  <ProtectedRoute><TeacherPublicProfile /></ProtectedRoute>
                } />
                <Route path="/teacher/connect" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><TeacherConnect /></ProtectedRoute>
                } />
                <Route path="/head-teacher/connect" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><TeacherConnect /></ProtectedRoute>
                } />
                <Route path="/teacher/library" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><TeacherLibrary /></ProtectedRoute>
                } />
                <Route path="/head-teacher/library" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><TeacherLibrary /></ProtectedRoute>
                } />
                <Route path="/teacher/textbooks" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><StudentTextbooks /></ProtectedRoute>
                } />
                <Route path="/teacher/textbooks/:id" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><TextbookReader /></ProtectedRoute>
                } />
                <Route path="/head-teacher/textbooks" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><StudentTextbooks /></ProtectedRoute>
                } />
                <Route path="/head-teacher/textbooks/:id" element={
                  <ProtectedRoute role={['teacher', 'head_teacher']}><TextbookReader /></ProtectedRoute>
                } />
                <Route path="/student/class-moments" element={
                  <ProtectedRoute role="student"><ClassMomentsPage backPath="/student/dashboard" /></ProtectedRoute>
                } />
                <Route path="/student/class-moments/:id" element={
                  <ProtectedRoute role="student"><ClassMomentsPage backPath="/student/dashboard" /></ProtectedRoute>
                } />

                <Route path="/teacher/class-moments" element={
                  <ProtectedRoute role="teacher"><ClassMomentsPage backPath="/teacher/dashboard" /></ProtectedRoute>
                } />
                <Route path="/teacher/class-moments/:id" element={
                  <ProtectedRoute role="teacher"><ClassMomentsPage backPath="/teacher/dashboard" /></ProtectedRoute>
                } />
                <Route path="/head-teacher/class-moments" element={
                  <ProtectedRoute role="head_teacher"><ClassMomentsPage backPath="/head-teacher/dashboard" /></ProtectedRoute>
                } />
                <Route path="/head-teacher/class-moments/:id" element={
                  <ProtectedRoute role="head_teacher"><ClassMomentsPage backPath="/head-teacher/dashboard" /></ProtectedRoute>
                } />

                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                <Route path="/profile" element={
                  <ProtectedRoute><Profile /></ProtectedRoute>
                } />
                <Route path="/messages" element={
                  <ProtectedRoute><Messages /></ProtectedRoute>
                } />
        </Routes>
        </Suspense>
        </AppErrorBoundary>
      </div>
      {!hideFooter && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <InstallProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
          <AppShell />
        </BrowserRouter>
      </InstallProvider>
    </AuthProvider>
  );
}
