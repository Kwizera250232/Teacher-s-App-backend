import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { api, uploadFile, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import CreateQuizModal from '../components/CreateQuizModal';
import DocPreviewModal from '../components/DocPreviewModal';
import ShareModal from '../components/ShareModal';
import QuizShareModal from '../components/QuizShareModal';
import QuizColleagueShareModal from '../components/QuizColleagueShareModal';
import NoteColleagueShareModal from '../components/NoteColleagueShareModal';
import SharedNoteAttribution from '../components/SharedNoteAttribution';
import SharedQuizAttribution from '../components/SharedQuizAttribution';
import StaleApiBanner from '../components/StaleApiBanner';
import { buildShareItem } from '../utils/shareLinks';
import ClassLeaderboard from '../components/ClassLeaderboard';
import VerifiedBadge from '../components/VerifiedBadge';
import ClassroomFeed from '../components/ClassroomFeed';
import CoTeacherInvite from '../components/CoTeacherInvite';
import NotifyParentsModal from '../components/staff/NotifyParentsModal';
import WeeklyDigestModal from '../components/staff/WeeklyDigestModal';
import ParentInviteModal from '../components/ParentInviteModal';
import CompositionStatusList from '../components/CompositionStatusList';
import ClassDeanHelp from '../components/ClassDeanHelp';
import GuestMarksPanel from '../components/GuestMarksPanel';
import ClassPointsPanel from '../components/ClassPointsPanel';
import AssignWorkToGroupModal from '../components/AssignWorkToGroupModal';
import TeacherQuizReportsPanel from '../components/quizReflection/TeacherQuizReportsPanel';
import AppNotificationsBell from '../components/AppNotificationsBell';
import '../components/StudentNotifications.css';
import { usePushNotifications } from '../hooks/usePushNotifications';
import '../pages/Dashboard.css';
import '../pages/MobileDashboard.css';

const TABS = ['Students', 'Feed', 'Announcements', 'Notes', 'Homework', 'Quizzes', 'Quiz reports', 'Leaderboard', 'Discussion', 'C. Status'];

export default function TeacherClassPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const basePath = location.pathname.startsWith('/head-teacher') ? '/head-teacher' : '/teacher';
  usePushNotifications(token);
  const [cls, setCls] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [tab, setTab] = useState('Students');
  const [data, setData] = useState([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [editQuiz, setEditQuiz] = useState(null);

  // Forms
  const [announcementText, setAnnouncementText] = useState('');
  const [noteForm, setNoteForm] = useState({ title: '', file: null });
  const [hwForm, setHwForm] = useState({ title: '', description: '', due_date: '', file: null });
  const [discussionText, setDiscussionText] = useState('');
  // Submissions viewer: { [hwId]: { open, submissions, gradeForm: { [subId]: { grade, feedback } } } }
  const [submissionsState, setSubmissionsState] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null); // { viewerUrl, fileName }
  const [shareItem, setShareItem] = useState(null);   // { title, text, url }
  const [quizShareModal, setQuizShareModal] = useState(null); // { quizTitle, className, shareUrl }
  const [quizShareBusy, setQuizShareBusy] = useState(null);
  const [colleagueShareQuiz, setColleagueShareQuiz] = useState(null); // { id, title }
  const [colleagueShareNote, setColleagueShareNote] = useState(null); // { id, title }
  const [selectedStudent, setSelectedStudent] = useState(null); // popup
  const [showNotifyParents, setShowNotifyParents] = useState(false);
  const [showWeeklyDigest, setShowWeeklyDigest] = useState(false);
  const [parentInviteFor, setParentInviteFor] = useState(null);
  const [assignWorkToGroup, setAssignWorkToGroup] = useState(null); // null | { quiz?, groupIds? }
  const [groupAssignments, setGroupAssignments] = useState([]);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab && TABS.includes(urlTab)) setTab(urlTab);
  }, [searchParams]);

  useEffect(() => {
    setPageLoading(true);
    api.get(`/classes/${id}`, token).then(data => {
      setCls(data);
      setPageLoading(false);
      try { localStorage.setItem(`class_${id}`, JSON.stringify(data)); } catch {}
    }).catch(() => {
      try {
        const cached = JSON.parse(localStorage.getItem(`class_${id}`));
        if (cached) { setCls(cached); setPageLoading(false); }
        else { setPageLoading(false); if (navigator.onLine) navigate(basePath + '/dashboard'); }
      } catch { setPageLoading(false); if (navigator.onLine) navigate(basePath + '/dashboard'); }
    });
  }, [id]);

  useEffect(() => {
    loadTab();
  }, [tab, id]);

  useEffect(() => {
    if (tab !== 'Quizzes' || !token) return;
    api.get(`/classes/${id}/group-quizzes`, token)
      .then((list) => setGroupAssignments(Array.isArray(list) ? list : []))
      .catch(() => setGroupAssignments([]));
  }, [tab, id, token, data]);

  const tCacheKey = (t) => `tclass_${id}_${t}`;

  const loadTab = async () => {
    setError('');
    if (tab === 'Leaderboard' || tab === 'Feed' || tab === 'C. Status' || tab === 'Students' || tab === 'Quiz reports') return;
    setTabLoading(true);
    setData([]);
    try {
      const endpointMap = {
        Announcements: `/classes/${id}/announcements`,
        Notes: `/classes/${id}/notes`,
        Homework: `/classes/${id}/homework`,
        Quizzes: `/classes/${id}/quizzes`,
        Discussion: `/classes/${id}/discussions`,
        Students: `/classes/${id}/students`,
      };
      const res = await api.get(endpointMap[tab], token);
      const list = Array.isArray(res) ? res : [];
      setData(list);
      try { localStorage.setItem(tCacheKey(tab), JSON.stringify(list)); } catch {}
    } catch (e) {
      const cached = JSON.parse(localStorage.getItem(tCacheKey(tab)) || '[]');
      const list = Array.isArray(cached) ? cached : [];
      if (list.length) setData(list);
      else if (navigator.onLine) setError(e.message);
    } finally {
      setTabLoading(false);
    }
  };

  const studentRows = Array.isArray(data) ? data : [];

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const postAnnouncement = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/classes/${id}/announcements`, { content: announcementText }, token);
      setAnnouncementText('');
      loadTab();
      showSuccess('Announcement posted!');
    } catch (e) { setError(e.message); }
  };

  const uploadNote = async (e) => {
    e.preventDefault();
    if (!noteForm.title) return;
    try {
      const fd = new FormData();
      fd.append('title', noteForm.title);
      if (noteForm.file) fd.append('file', noteForm.file);
      await uploadFile(`/classes/${id}/notes`, fd, token);
      setNoteForm({ title: '', file: null });
      loadTab();
      showSuccess('Note uploaded!');
    } catch (e) { setError(e.message); }
  };

  const postHomework = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('title', hwForm.title);
      if (hwForm.description) fd.append('description', hwForm.description);
      if (hwForm.due_date) fd.append('due_date', hwForm.due_date);
      if (hwForm.file) fd.append('file', hwForm.file);
      await uploadFile(`/classes/${id}/homework`, fd, token);
      setHwForm({ title: '', description: '', due_date: '', file: null });
      loadTab();
      showSuccess('Homework created!');
    } catch (e) { setError(e.message); }
  };

  const postDiscussion = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/classes/${id}/discussions`, { content: discussionText }, token);
      setDiscussionText('');
      loadTab();
    } catch (e) { setError(e.message); }
  };

  const deleteItem = async (endpoint) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      await api.delete(endpoint, token);
      loadTab();
    } catch (e) { setError(e.message); }
  };

  const getViewerUrl = (filePath) => {
    return `${UPLOADS_BASE}/uploads/${filePath}`;
  };

  const getDueStatus = (due_date) => {
    if (!due_date) return null;
    const due = new Date(due_date);
    const now = new Date();
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: 'Overdue', color: '#ef4444' };
    if (diffDays === 0) return { label: 'Due today', color: '#f97316' };
    if (diffDays <= 2) return { label: `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`, color: '#f59e0b' };
    return { label: `Due ${due.toLocaleDateString()}`, color: '#64748b' };
  };

  const loadSubmissions = async (hwId) => {
    const isOpen = submissionsState[hwId]?.open;
    if (isOpen) {
      setSubmissionsState(prev => ({ ...prev, [hwId]: { ...prev[hwId], open: false } }));
      return;
    }
    try {
      const subs = await api.get(`/classes/${id}/homework/${hwId}/submissions`, token);
      const gradeForm = {};
      subs.forEach(s => { gradeForm[s.id] = { grade: s.grade ?? '', feedback: s.feedback ?? '' }; });
      setSubmissionsState(prev => ({ ...prev, [hwId]: { open: true, submissions: subs, gradeForm } }));
    } catch (e) { setError(e.message); }
  };

  const gradeSubmission = async (hwId, subId) => {
    const gf = submissionsState[hwId]?.gradeForm?.[subId];
    if (!gf) return;
    try {
      await api.put(`/classes/${id}/homework/${hwId}/submissions/${subId}/grade`, { grade: gf.grade, feedback: gf.feedback }, token);
      showSuccess('Grade saved!');
      // Refresh submissions
      const subs = await api.get(`/classes/${id}/homework/${hwId}/submissions`, token);
      const gradeForm = {};
      subs.forEach(s => { gradeForm[s.id] = { grade: s.grade ?? '', feedback: s.feedback ?? '' }; });
      setSubmissionsState(prev => ({ ...prev, [hwId]: { open: true, submissions: subs, gradeForm } }));
    } catch (e) { setError(e.message); }
  };

  if (pageLoading) {
    return (
      <div className="class-page wa-theme">
        <header className="dash-header wa-class-header">
          <button className="btn btn-outline btn-sm" onClick={() => navigate(`${basePath}/dashboard`)}>← Back</button>
          <div className="dash-brand">🎓 UClass</div>
        </header>
        <main className="class-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
            <p>Loading class...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="class-page wa-theme">
      <header className="dash-header wa-class-header">
        <button type="button" className="wa-back-btn" onClick={() => navigate(`${basePath}/dashboard`)}>←</button>
        <div className="wa-class-header-title">
          <strong>{cls?.name || 'Class'}</strong>
          <span>{cls?.subject || 'UClass'}</span>
        </div>
        <AppNotificationsBell className="student-notif-bell--header wa-class-notif" basePath={basePath} />
      </header>

      <main className="class-main wa-chat-screen">
        <StaleApiBanner />
        {cls && (
          <div className="class-hero">
            <div>
              <h1>{cls.name}</h1>
              {cls.subject && <div className="subject">📖 {cls.subject}</div>}
              <div className="class-dean-help-wrap">
                <ClassDeanHelp token={token} classId={id} className={cls.name} isTeacher />
              </div>
            </div>
            <div className="class-hero-side">
              <div className="class-hero-notif">
                <AppNotificationsBell className="student-notif-bell--header" basePath={basePath} />
              </div>
              <div className="class-hero-code">
                <span className="code-label">Class Code</span>
                <div className="code-big">{cls.class_code}</div>
              </div>
            </div>
          </div>
        )}

        <div className="tabs">
          {TABS.map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {tab === 'Feed' && (
          <>
            <CoTeacherInvite classId={id} token={token} />
            <ClassroomFeed classId={id} token={token} />
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>📧 Weekly parent update</h4>
              <p style={{ fontSize: '0.85rem', color: '#92400e', margin: '0 0 0.75rem' }}>
                Save a weekly summary (behavior, work, attendance, gaps) for parents linked to students in this class.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowWeeklyDigest(true)}
                >
                  Weekly parent update
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowNotifyParents(true)}
                >
                  Notify parents in app
                </button>
              </div>
            </div>
          </>
        )}

        {/* Announcements */}
        {tab === 'Announcements' && (
          <>
            <form onSubmit={postAnnouncement} style={{ marginBottom: 24, display: 'flex', gap: 10 }}>
              <input
                className="form-group"
                style={{ flex: 1, padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, fontSize: 14 }}
                placeholder="Write an announcement..."
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary">Post</button>
            </form>
            {data.map(a => (
              <div key={a.id} className="item-card">
                <div className="item-card-body">
                  <p>{a.content}</p>
                  <div className="meta">📢 {new Date(a.created_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShareItem(buildShareItem({
                      title: a.content,
                      description: `Announcement on UClass: ${a.content}`,
                      classId: id,
                      tab: 'Announcements',
                      role: 'teacher',
                    }))}
                  >📱 Social Media</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteItem(`/classes/${id}/announcements/${a.id}`)}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Notes */}
        {tab === 'Notes' && (
          <>
            <form onSubmit={uploadNote} style={{ background: 'white', padding: 20, borderRadius: 10, marginBottom: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div className="form-group">
                <label>Note Title *</label>
                <input type="text" value={noteForm.title} onChange={e => setNoteForm({ ...noteForm, title: e.target.value })} placeholder="e.g. Chapter 1 - Algebra" required />
              </div>
              <div className="form-group">
                <label>File (PDF, DOC, etc.)</label>
                <input type="file" onChange={e => setNoteForm({ ...noteForm, file: e.target.files[0] })} accept=".pdf,.doc,.docx,.ppt,.pptx" />
              </div>
              <button type="submit" className="btn btn-primary">Upload Note</button>
            </form>
            {data.map(n => (
              <div key={n.id} className="item-card">
                <div className="item-card-body">
                  <h3>📄 {n.title}</h3>
                  <SharedNoteAttribution note={n} />
                  {n.file_name && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
                      background: '#f0f2ff', border: '1px solid #c7d2fe', borderRadius: 6,
                      padding: '3px 10px', fontSize: 12, color: '#4338ca', fontWeight: 600 }}>
                      <span>📎</span>
                      <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.file_name.replace(/^\d+-\d+\./, '')}
                      </span>
                    </div>
                  )}
                  {n.file_name && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPreviewDoc({ fileUrl: `${UPLOADS_BASE}/download/notes/${n.file_path}?inline=1`, fileName: n.file_name })}
                      >👁 Preview</button>
                      <a href={`${UPLOADS_BASE}/download/notes/${n.file_path}`} download={n.file_name} className="btn btn-primary btn-sm">⬇ Download</a>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShareItem(buildShareItem({
                          title: `📄 ${n.title}`,
                          description: `Note on UClass: ${n.title}`,
                          fileKind: 'notes',
                          filePath: n.file_path,
                          classId: id,
                          tab: 'Notes',
                          role: 'teacher',
                        }))}
                      >📱 Social Media</button>
                    </div>
                  )}
                  <div className="meta" style={{ marginTop: 6 }}>{new Date(n.created_at).toLocaleDateString()}</div>
                </div>
                <div className="item-card-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {!n.is_shared && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setColleagueShareNote({ id: n.id, title: n.title })}
                    >
                      Share w/ teacher
                    </button>
                  )}
                  {!n.is_shared && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteItem(`/classes/${id}/notes/${n.id}`)}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Homework */}
        {tab === 'Homework' && (
          <>
            <form onSubmit={postHomework} style={{ background: 'white', padding: 20, borderRadius: 10, marginBottom: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <div className="form-group">
                <label>Title *</label>
                <input type="text" value={hwForm.title} onChange={e => setHwForm({ ...hwForm, title: e.target.value })} placeholder="e.g. Exercise 3" required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={hwForm.description} onChange={e => setHwForm({ ...hwForm, description: e.target.value })} placeholder="Instructions..." />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={hwForm.due_date} onChange={e => setHwForm({ ...hwForm, due_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Attachment (PDF, DOC, etc.)</label>
                <input type="file" onChange={e => setHwForm({ ...hwForm, file: e.target.files[0] })} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" />
              </div>
              <button type="submit" className="btn btn-primary">Create Homework</button>
            </form>
            {data.map(hw => {
              const dueStatus = getDueStatus(hw.due_date);
              const ss = submissionsState[hw.id];
              return (
                <div key={hw.id} className="item-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div className="item-card-body" style={{ flex: 1 }}>
                      <h3>📝 {hw.title}</h3>
                      {hw.description && <p>{hw.description}</p>}
                      {dueStatus && (
                        <div className="meta" style={{ color: dueStatus.color, fontWeight: 600 }}>⏰ {dueStatus.label}</div>
                      )}
                      {hw.file_name && (
                        <>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
                            background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6,
                            padding: '3px 10px', fontSize: 12, color: '#c2410c', fontWeight: 600 }}>
                            <span>📎</span>
                            <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {hw.file_name.replace(/^\d+-\d+\./, '')}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setPreviewDoc({ fileUrl: `${UPLOADS_BASE}/download/homework/${hw.file_path}?inline=1`, fileName: hw.file_name })}
                            >👁 Preview</button>
                            <a href={`${UPLOADS_BASE}/download/homework/${hw.file_path}`} download={hw.file_name} className="btn btn-primary btn-sm">⬇ Download</a>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setShareItem(buildShareItem({
                                title: `📝 ${hw.title}`,
                                description: `Homework on UClass: ${hw.title}`,
                                fileKind: 'homework',
                                filePath: hw.file_path,
                                classId: id,
                                tab: 'Homework',
                                role: 'teacher',
                              }))}
                            >📱 Social Media</button>
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => loadSubmissions(hw.id)}>
                        {ss?.open ? '▲ Hide' : '👥 Submissions'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteItem(`/classes/${id}/homework/${hw.id}`)}>Delete</button>
                    </div>
                  </div>

                  {/* Submissions panel */}
                  {ss?.open && (
                    <div style={{ marginTop: 14, borderTop: '1.5px solid #e8e8e8', paddingTop: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#374151', marginBottom: 12 }}>
                        📋 Submissions ({ss.submissions.length})
                      </div>
                      {ss.submissions.length === 0
                        ? <p style={{ color: '#94a3b8', fontSize: 14 }}>No submissions yet.</p>
                        : ss.submissions.map(sub => (
                          <div key={sub.id} style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', marginBottom: 12, border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>👤 {sub.student_name}</div>
                              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                {new Date(sub.submitted_at).toLocaleString()}
                              </div>
                            </div>
                            {sub.text_response && (
                              <p style={{ fontSize: 14, color: '#475569', background: '#fff', padding: '8px 12px', borderRadius: 7, border: '1px solid #e2e8f0', marginBottom: 8 }}>
                                {sub.text_response}
                              </p>
                            )}
                            {sub.file_name && (
                              <>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4,
                                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6,
                                  padding: '3px 10px', fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                                  <span>📎</span>
                                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {sub.file_name.replace(/^\d+-\d+\./, '')}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginBottom: 10, marginTop: 6, flexWrap: 'wrap' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setPreviewDoc({ fileUrl: `${UPLOADS_BASE}/download/homework/${sub.file_path}?inline=1`, fileName: sub.file_name })}
                                  >👁 Preview</button>
                                  <a href={`${UPLOADS_BASE}/download/homework/${sub.file_path}`} download={sub.file_name} className="btn btn-primary btn-sm">⬇ Download</a>
                                </div>
                              </>
                            )}
                            {/* Grade form */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                              <div>
                                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 3 }}>Grade (0–100)</label>
                                <input
                                  type="number" min="0" max="100"
                                  value={ss.gradeForm[sub.id]?.grade ?? ''}
                                  onChange={e => setSubmissionsState(prev => ({
                                    ...prev,
                                    [hw.id]: { ...prev[hw.id], gradeForm: { ...prev[hw.id].gradeForm, [sub.id]: { ...prev[hw.id].gradeForm[sub.id], grade: e.target.value } } }
                                  }))}
                                  style={{ width: 80, padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 14 }}
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 140 }}>
                                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 3 }}>Feedback (optional)</label>
                                <input
                                  type="text"
                                  placeholder="Well done! / Try again..."
                                  value={ss.gradeForm[sub.id]?.feedback ?? ''}
                                  onChange={e => setSubmissionsState(prev => ({
                                    ...prev,
                                    [hw.id]: { ...prev[hw.id], gradeForm: { ...prev[hw.id].gradeForm, [sub.id]: { ...prev[hw.id].gradeForm[sub.id], feedback: e.target.value } } }
                                  }))}
                                  style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
                                />
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => gradeSubmission(hw.id, sub.id)}
                              >
                                {sub.grade !== null && sub.grade !== undefined ? '✏️ Update Grade' : '✅ Save Grade'}
                              </button>
                            </div>
                            {sub.grade !== null && sub.grade !== undefined && (
                              <div style={{ marginTop: 6, fontSize: 13, color: '#166534', fontWeight: 600 }}>
                                Current grade: {sub.grade}/100 {sub.graded_at && `· Graded ${new Date(sub.graded_at).toLocaleDateString()}`}
                              </div>
                            )}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Quizzes */}
        {tab === 'Quizzes' && (
          <>
            <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h2>Quizzes</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAssignWorkToGroup({})}>
                  👥 Assign work to group
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setShowQuizModal(true)}>+ Create Quiz</button>
              </div>
            </div>
            {groupAssignments.length > 0 && (
              <div style={{ marginBottom: 16, background: '#f0f9ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #bae6fd' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#0369a1' }}>👥 Group work assigned</h3>
                {groupAssignments.map((a) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #e0f2fe', fontSize: 14, flexWrap: 'wrap' }}>
                    <span>
                      <strong>{a.group_name}</strong> → {a.quiz_title}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: a.status === 'submitted' ? '#166534' : a.status === 'active' ? '#b45309' : '#64748b',
                      }}>
                        {a.status === 'submitted'
                          ? `Done ${a.score}/${a.total}`
                          : a.status === 'active' && a.started_by_student_id
                            ? 'In progress'
                            : 'Released'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ color: '#b91c1c', borderColor: '#fecaca', fontSize: 11 }}
                        onClick={async () => {
                          const msg = a.status === 'submitted'
                            ? `Remove submitted group quiz "${a.quiz_title}" from ${a.group_name}? Marks will be removed from the assignment list.`
                            : `Remove group quiz "${a.quiz_title}" from ${a.group_name}?`;
                          if (!window.confirm(msg)) return;
                          try {
                            await api.delete(`/classes/${id}/group-quizzes/${a.id}`, token);
                            setGroupAssignments((prev) => prev.filter((x) => x.id !== a.id));
                            showSuccess('Group quiz removed.');
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <details style={{ marginBottom: 16, background: '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#075e54' }}>
                👤 Guest marks from share links
              </summary>
              <div style={{ marginTop: 12 }}>
                <GuestMarksPanel token={token} classId={id} compact />
              </div>
            </details>
            {data.map(q => (
              <div key={q.id} className="item-card">
                <div className="item-card-body">
                  <h3>❓ {q.title}</h3>
                  <SharedQuizAttribution quiz={q} />
                  {q.description && <p>{q.description}</p>}
                  <div className="meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{new Date(q.created_at).toLocaleDateString()}</span>
                    {q.is_shared ? (
                      <span style={{ color: '#0284c7', fontWeight: 600 }}>🔗 Shared into this class</span>
                    ) : q.attempt_count > 0 ? (
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>👁 {q.attempt_count} attempt{q.attempt_count > 1 ? 's' : ''} — locked</span>
                    ) : (
                      <span style={{ color: '#22c55e', fontWeight: 600 }}>✏️ Editable</span>
                    )}
                  </div>
                </div>
                <div className="item-card-actions">
                  {!q.is_shared && (
                    <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditQuiz(q)}
                    disabled={q.attempt_count > 0}
                    title={q.attempt_count > 0 ? 'Cannot edit after students have attempted' : 'Edit quiz questions'}
                  >Edit</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      setQuizShareBusy(q.id);
                      try {
                        const data = await api.post(
                          `/classes/${id}/quizzes/${q.id}/share`,
                          { channel: 'social' },
                          token
                        );
                        setQuizShareModal({
                          quizTitle: q.title,
                          className: cls?.name,
                          shareUrl: data.share_url || data.app_url,
                        });
                      } catch (e) {
                        setError(e.message || 'Could not create share link.');
                      } finally {
                        setQuizShareBusy(null);
                      }
                    }}
                    disabled={quizShareBusy === q.id}
                  >
                    {quizShareBusy === q.id ? '…' : 'Share link'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setColleagueShareQuiz({ id: q.id, title: q.title })}
                    title="Share with another teacher at your school"
                  >
                    Share w/ teacher
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setAssignWorkToGroup({ quiz: { id: q.id, title: q.title } })}
                    title="Assign this quiz to a group to do and submit together"
                  >
                    Assign work to group
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteItem(`/classes/${id}/quizzes/${q.id}`)}>Delete</button>
                    </>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate(`${basePath}/classes/${id}/quizzes/${q.id}/results`)}>Results</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'Quiz reports' && (
          <>
            <div className="section-header">
              <h2>📋 Quiz reports</h2>
            </div>
            <TeacherQuizReportsPanel
              classId={id}
              token={token}
              highlightReportId={searchParams.get('report')}
            />
          </>
        )}

        {/* Leaderboard */}
        {tab === 'Leaderboard' && (
          <ClassLeaderboard classId={id} />
        )}

        {/* Discussion */}
        {tab === 'Discussion' && (
          <>
            <div className="discussion-list">
              {data.map(d => (
                <div key={d.id} className={`discussion-msg ${d.author_role === 'teacher' ? 'teacher-msg' : ''}`}>
                  <div className="author" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {d.author_name}<VerifiedBadge size={13} info={{ items: [
                      { icon: '👤', label: 'Role', value: d.author_role },
                    ] }} />
                    <span className="role-badge">{d.author_role}</span>
                  </div>
                  <div className="body">{d.content}</div>
                  <div className="time">{new Date(d.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <form onSubmit={postDiscussion} className="discussion-input">
              <input placeholder="Write a message..." value={discussionText} onChange={e => setDiscussionText(e.target.value)} required />
              <button type="submit" className="btn btn-primary">Send</button>
            </form>
          </>
        )}

        {tab === 'C. Status' && (
          <div style={{ padding: '1rem 0' }}>
            <CompositionStatusList token={token} classId={id} />
          </div>
        )}

        {/* Students */}
        {tab === 'Students' && (
          <div style={{ padding: '1.5rem 0' }}>
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: '1rem',
              }}
            >
              <strong style={{ color: '#166534' }}>👪 Parent invite</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#374151' }}>
                Tap <strong>Parent invite</strong> under a student to copy or share a WhatsApp link for their parent.
              </p>
            </div>
            <CoTeacherInvite classId={id} token={token} />
            <ClassPointsPanel
              classId={id}
              token={token}
              classMeta={cls}
              basePath={basePath}
              onError={(msg) => setError(msg)}
              onSuccess={(msg) => showSuccess(msg)}
              onStudentClick={setSelectedStudent}
              onParentInvite={setParentInviteFor}
              onAssignWorkToGroup={(group) => setAssignWorkToGroup({
                groupIds: group ? [group.id] : undefined,
              })}
            />
          </div>
        )}

        {/* Student profile popup */}
        {selectedStudent && (() => {
          const popName = String(selectedStudent.name || 'Student').trim();
          const popJoined = selectedStudent.joined_at
            ? new Date(selectedStudent.joined_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : '—';
          return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => e.target === e.currentTarget && setSelectedStudent(null)}
          >
            <div style={{ background: 'white', borderRadius: 20, padding: '2rem', minWidth: 280, maxWidth: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'][selectedStudent.id % 8],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 26, margin: '0 auto 1rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
              }}>
                {popName.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                <strong style={{ fontSize: 18, color: '#1e293b' }}>{popName}</strong>
                <VerifiedBadge size={16} info={{ items: [
                  { icon: '📚', label: 'Class', value: cls?.name },
                  { icon: '📅', label: 'Joined', value: popJoined },
                  { icon: '👨‍🏫', label: 'Teacher', value: cls?.teacher_name },
                ] }} />
              </div>
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: '1.25rem' }}>{selectedStudent.email || '—'}</p>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>📚</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Ishuri</div>
                    <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>{cls?.name || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🏫</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Ikigo</div>
                    <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>{selectedStudent.school_name || 'Ntabwo byasohotse'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Yinjiriye</div>
                    <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>
                      {selectedStudent.joined_at
                        ? new Date(selectedStudent.joined_at).toLocaleDateString('fr-RW', { year: 'numeric', month: 'long', day: 'numeric' })
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '1rem', width: '100%' }}
                onClick={() => {
                  setParentInviteFor({
                    studentId: selectedStudent.id,
                    studentName: popName,
                  });
                }}
              >
                👪 Parent invite link
              </button>
              <button onClick={() => setSelectedStudent(null)} style={{ marginTop: '0.75rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: 10, padding: '0.6rem 2rem', cursor: 'pointer', fontWeight: 600 }}>Funga</button>
            </div>
          </div>
          );
        })()}
      </main>

      {showQuizModal && (
        <CreateQuizModal
          token={token}
          classId={id}
          onClose={() => setShowQuizModal(false)}
          onCreated={(quiz) => {
            setShowQuizModal(false);
            loadTab();
            showSuccess('Quiz created!');
            if (quiz?.id) setAssignWorkToGroup({ quiz: { id: quiz.id, title: quiz.title } });
          }}
        />
      )}
      {editQuiz && (
        <CreateQuizModal
          token={token}
          classId={id}
          editQuiz={editQuiz}
          onClose={() => setEditQuiz(null)}
          onCreated={() => { setEditQuiz(null); loadTab(); showSuccess('Quiz updated!'); }}
        />
      )}

      {previewDoc && (
        <DocPreviewModal
          fileUrl={previewDoc.fileUrl}
          fileName={previewDoc.fileName}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {shareItem && (
        <ShareModal
          title={shareItem.title}
          text={shareItem.text}
          url={shareItem.url}
          onClose={() => setShareItem(null)}
        />
      )}

      {quizShareModal && (
        <QuizShareModal
          quizTitle={quizShareModal.quizTitle}
          className={quizShareModal.className}
          shareUrl={quizShareModal.shareUrl}
          onClose={() => setQuizShareModal(null)}
        />
      )}

      {assignWorkToGroup && (
        <AssignWorkToGroupModal
          classId={id}
          token={token}
          quiz={assignWorkToGroup.quiz}
          presetGroupIds={assignWorkToGroup.groupIds}
          onClose={() => setAssignWorkToGroup(null)}
          onCreateQuiz={() => {
            setAssignWorkToGroup(null);
            setTab('Quizzes');
            setShowQuizModal(true);
          }}
          onAssigned={() => {
            showSuccess('Quiz released to groups — students notified.');
            api.get(`/classes/${id}/group-quizzes`, token)
              .then((list) => setGroupAssignments(Array.isArray(list) ? list : []))
              .catch(() => {});
          }}
        />
      )}

      {colleagueShareQuiz && (
        <QuizColleagueShareModal
          classId={id}
          quizId={colleagueShareQuiz.id}
          quizTitle={colleagueShareQuiz.title}
          token={token}
          onClose={() => setColleagueShareQuiz(null)}
          onSent={() => showSuccess('Share request sent to your colleague.')}
        />
      )}

      {colleagueShareNote && (
        <NoteColleagueShareModal
          classId={id}
          noteId={colleagueShareNote.id}
          noteTitle={colleagueShareNote.title}
          token={token}
          onClose={() => setColleagueShareNote(null)}
          onSent={() => showSuccess('Note share request sent to your colleague.')}
        />
      )}

      {showNotifyParents && (
        <NotifyParentsModal
          token={token}
          classId={parseInt(id, 10)}
          onClose={() => setShowNotifyParents(false)}
        />
      )}

      {showWeeklyDigest && (
        <WeeklyDigestModal
          token={token}
          classId={parseInt(id, 10)}
          onClose={() => setShowWeeklyDigest(false)}
          onSent={() => showSuccess('Weekly digest sent to parents.')}
        />
      )}

      {parentInviteFor && (
        <ParentInviteModal
          token={token}
          studentId={parentInviteFor.studentId}
          studentName={parentInviteFor.studentName}
          onClose={() => setParentInviteFor(null)}
        />
      )}
    </div>
  );
}
