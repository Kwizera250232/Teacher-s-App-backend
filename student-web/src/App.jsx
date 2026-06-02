import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import TeacherDashboard from './pages/TeacherDashboard';
import HeadTeacherDashboard from './pages/HeadTeacherDashboard';
import ParentHub from './pages/ParentHub';
import ParentDashboard from './pages/ParentDashboard';
import StudentDashboard from './pages/StudentDashboard';
import { dashboardPath } from './utils/roles';
import TeacherClassPage from './pages/TeacherClassPage';
import RecordCatMarks from './pages/RecordCatMarks';
import StudentClassPage from './pages/StudentClassPage';
import TakeQuiz from './pages/TakeQuiz';
import QuizResults from './pages/QuizResults';
import AdminDashboard from './pages/AdminDashboard';
import JoinClass from './pages/JoinClass';
import StudentNotes from './pages/StudentNotes';
import ClassMomentsPage from './pages/ClassMomentsPage';
import InviteSignup from './pages/InviteSignup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Messages from './pages/Messages';
import Footer from './components/Footer';
import OfflineBanner from './components/OfflineBanner';
import { InstallProvider } from './components/InstallPrompt';
import './components/Footer.css';
import './styles/WaAppShell.css';
import './styles/WaChatShell.css';
import './styles/AppFullscreen.css';

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
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
  const hideFooter = /\/messages(\/|$)|\/parent\/dashboard/.test(location.pathname);

  return (
    <div className={`app-wa-shell${hideFooter ? ' app-wa-shell--chat-fullscreen' : ''}`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <OfflineBanner />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/welcome" element={<Landing />} />
                <Route path="/join" element={<JoinClass />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/invite" element={<InviteSignup />} />

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
                <Route path="/student/notes" element={
                  <ProtectedRoute role="student"><StudentNotes /></ProtectedRoute>
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
