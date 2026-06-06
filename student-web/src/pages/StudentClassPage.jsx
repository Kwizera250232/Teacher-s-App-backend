import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, uploadFile, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import DocPreviewModal from '../components/DocPreviewModal';
import ShareModal from '../components/ShareModal';
import { buildShareItem } from '../utils/shareLinks';
import ClassLeaderboard from '../components/ClassLeaderboard';
import ClassmateProfileModal from '../components/ClassmateProfileModal';
import ClassroomFeed from '../components/ClassroomFeed';
import ClassDeanHelp from '../components/ClassDeanHelp';
import ClassMomentsClassFold from '../components/classMoments/ClassMomentsClassFold';
import '../components/classMoments/ClassMoments.css';
import VerifiedBadge from '../components/VerifiedBadge';
import SharedQuizAttribution from '../components/SharedQuizAttribution';
import SharedNoteAttribution from '../components/SharedNoteAttribution';
import StudentMyGroupsPanel from '../components/StudentMyGroupsPanel';
import StudentGroupQuizCards from '../components/StudentGroupQuizCards';
import StudentNotificationsBell from '../components/StudentNotificationsBell';
import { uniqueGroupAssignments } from '../utils/groupQuizUtils';

function quizRowToGroupAssignment(q) {
  return {
    id: q.group_assignment_id,
    class_id: q.class_id,
    group_id: q.group_id,
    group_name: q.group_name,
    quiz_id: q.id,
    quiz_title: q.title,
    quiz_description: q.description,
    status: q.status || q.assignment_status,
    score: q.score,
    total: q.total,
    started_by_student_id: q.started_by_student_id,
    started_by_name: q.started_by_name,
    submitted_by_name: q.submitted_by_name,
    created_at: q.created_at,
  };
}
import '../pages/Dashboard.css';

const CLASSMATE_DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%2325d366'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

const TABS = ['Feed', 'Groups', 'Announcements', 'Notes', 'Homework', 'Quizzes', 'Leaderboard', 'Discussion', 'Classmates'];

export default function StudentClassPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cls, setCls] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [tab, setTab] = useState('Announcements');
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [discussionText, setDiscussionText] = useState('');
  // Submission state: { [hwId]: { submitting, form, mySubmission } }
  const [subState, setSubState] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null); // { viewerUrl, fileName }
  const [shareItem, setShareItem] = useState(null);   // { title, text, url }
  const [classmates, setClassmates] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [groupQuizzes, setGroupQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

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
        else { setPageLoading(false); if (navigator.onLine) navigate('/student/dashboard'); }
      } catch { setPageLoading(false); if (navigator.onLine) navigate('/student/dashboard'); }
    });
  }, [id]);

  useEffect(() => { loadTab(); }, [tab, id]);

  const cacheKey = (t) => `class_${id}_${t}`;

  const loadTab = async () => {
    setError('');
    if (tab === 'Leaderboard' || tab === 'Feed') return;
    if (tab === 'Groups') {
      setGroupsLoading(true);
      try {
        const res = await api.get(`/classes/${id}/my-groups`, token);
        setMyGroups(Array.isArray(res) ? res : []);
        setGroupsError('');
      } catch (e) {
        if (/404|not found/i.test(String(e.message))) {
          setGroupsError('Groups are not on the server yet — ask your teacher to deploy the latest API.');
          setMyGroups([]);
        } else {
          setGroupsError(e.message);
        }
      } finally {
        setGroupsLoading(false);
      }
      return;
    }
    if (tab === 'Classmates') {
      try {
        const res = await api.get(`/classes/${id}/classmates`, token);
        setClassmates(res.filter(p => p.id !== user?.id));
        try { localStorage.setItem(cacheKey('Classmates'), JSON.stringify(res)); } catch {}
      } catch (e) {
        const cached = JSON.parse(localStorage.getItem(cacheKey('Classmates')) || '[]');
        if (cached.length) setClassmates(cached.filter(p => p.id !== user?.id));
        else if (navigator.onLine) setError(e.message);
        setClassmates(prev => prev.length ? prev : []);
      }
      return;
    }
    if (tab === 'Quizzes') {
      setQuizzesLoading(true);
      try {
        const list = await api.get(`/classes/${id}/quizzes`, token);
        const rows = Array.isArray(list) ? list : [];
        let team = rows.filter((q) => q.is_group_quiz).map(quizRowToGroupAssignment);
        const seenSolo = new Set();
        let solo = rows.filter((q) => {
          if (q.is_group_quiz) return false;
          if (seenSolo.has(q.id)) return false;
          seenSolo.add(q.id);
          return true;
        });

        if (!team.length) {
          const legacy = await api.get(`/classes/${id}/my-group-quizzes`, token).catch(() => []);
          team = uniqueGroupAssignments(Array.isArray(legacy) ? legacy : []);
        } else {
          team = uniqueGroupAssignments(team);
        }

        setGroupQuizzes(team);
        setData(solo);
        try {
          localStorage.setItem(cacheKey('Quizzes'), JSON.stringify(rows));
          localStorage.setItem(cacheKey('Quizzes_team'), JSON.stringify(team));
        } catch {}
      } catch (e) {
        const cached = JSON.parse(localStorage.getItem(cacheKey('Quizzes')) || '[]');
        const cachedTeam = JSON.parse(localStorage.getItem(cacheKey('Quizzes_team')) || '[]');
        if (cached.length || cachedTeam.length) {
          const rows = Array.isArray(cached) ? cached : [];
          const teamFromCache = cachedTeam.length
            ? uniqueGroupAssignments(cachedTeam)
            : rows.filter((q) => q.is_group_quiz).map(quizRowToGroupAssignment);
          setGroupQuizzes(teamFromCache);
          setData(rows.filter((q) => !q.is_group_quiz).length ? rows.filter((q) => !q.is_group_quiz) : cached.filter((q) => !q.is_group_quiz));
        } else if (navigator.onLine) setError(e.message);
      } finally {
        setQuizzesLoading(false);
      }
      return;
    }
    try {
      const map = {
        Announcements: `/classes/${id}/announcements`,
        Notes: `/classes/${id}/notes`,
        Homework: `/classes/${id}/homework`,
        Discussion: `/classes/${id}/discussions`,
      };
      const res = await api.get(map[tab], token);
      setData(res);
      try { localStorage.setItem(cacheKey(tab), JSON.stringify(res)); } catch {}
      if (tab === 'Homework') {
        const subs = {};
        await Promise.all(res.map(async (hw) => {
          try {
            const sub = await api.get(`/classes/${id}/homework/${hw.id}/my-submission`, token);
            subs[hw.id] = { submitting: false, form: { text: '', file: null }, mySubmission: sub };
          } catch {
            subs[hw.id] = { submitting: false, form: { text: '', file: null }, mySubmission: null };
          }
        }));
        setSubState(subs);
      }
    } catch (e) {
      const cached = JSON.parse(localStorage.getItem(cacheKey(tab)) || '[]');
      if (cached.length) setData(cached);
      else if (navigator.onLine) setError(e.message);
    }
  };

  const postDiscussion = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/classes/${id}/discussions`, { content: discussionText }, token);
      setDiscussionText('');
      loadTab();
    } catch (e) { setError(e.message); }
  };

  const submitHomework = async (e, hwId) => {
    e.preventDefault();
    const st = subState[hwId];
    if (!st?.form?.text && !st?.form?.file) {
      setError('Please write a response or attach a file.');
      return;
    }
    setSubState(prev => ({ ...prev, [hwId]: { ...prev[hwId], submitting: true } }));
    setError('');
    try {
      const fd = new FormData();
      if (st.form.text) fd.append('text_response', st.form.text);
      if (st.form.file) fd.append('file', st.form.file);
      const sub = await uploadFile(`/classes/${id}/homework/${hwId}/submit`, fd, token);
      setSubState(prev => ({ ...prev, [hwId]: { submitting: false, form: { text: '', file: null }, mySubmission: sub } }));
      showSuccess('Homework submitted successfully!');
    } catch (e) {
      setError(e.message);
      setSubState(prev => ({ ...prev, [hwId]: { ...prev[hwId], submitting: false } }));
    }
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

  if (pageLoading) {
    return (
      <div className="class-page wa-theme">
        <header className="dash-header wa-class-header">
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/student/dashboard')}>← Back</button>
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
        <button type="button" className="wa-back-btn" onClick={() => navigate('/student/dashboard')}>←</button>
        <div className="wa-class-header-title">
          <strong>{cls?.name || 'Class'}</strong>
          <span>{cls?.subject || 'UClass'}</span>
        </div>
        <StudentNotificationsBell className="student-notif-bell--header wa-class-notif" />
      </header>

      <main className="class-main wa-chat-screen">
        {cls && (
          <div className="class-hero">
            <div>
              <h1>{cls.name}</h1>
              {cls.subject && <div className="subject">📖 {cls.subject}</div>}
              <div className="class-dean-help-wrap">
                <ClassDeanHelp token={token} classId={id} className={cls.name} />
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

        {tab === 'Feed' && <ClassroomFeed classId={id} token={token} />}

        {tab === 'Announcements' && (
          data.length === 0
            ? <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No announcements yet.</p>
            : data.map(a => (
              <div key={a.id} className="item-card">
                <div className="item-card-body">
                  <p>{a.content}</p>
                  <div className="meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📢 {a.teacher_name}<VerifiedBadge size={13} info={{ items: [
                    { icon: '👨‍🏫', label: 'Teacher', value: a.teacher_name },
                    { icon: '📅', label: 'Posted', value: new Date(a.created_at).toLocaleDateString() },
                  ] }} /> · {new Date(a.created_at).toLocaleString()}</div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShareItem(buildShareItem({
                    title: a.content,
                    description: `Announcement on UClass: ${a.content}`,
                    classId: id,
                    tab: 'Announcements',
                  }))}
                >
                  📱 Social Media
                </button>
              </div>
            ))
        )}

        {tab === 'Notes' && (
          data.length === 0
            ? <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No notes uploaded yet.</p>
            : data.map(n => (
              <div key={n.id} className="item-card item-card-stack">
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
                  <div className="meta" style={{ marginTop: 6 }}>{new Date(n.created_at).toLocaleDateString()}</div>
                </div>
                {n.file_path && (
                  <div className="item-card-btns">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPreviewDoc({ fileUrl: `${UPLOADS_BASE}/download/notes/${n.file_path}?inline=1`, fileName: n.file_name || n.title })}
                    >👁 Preview</button>
                    <a href={`${UPLOADS_BASE}/download/notes/${n.file_path}`} download={n.file_name || true} className="btn btn-primary btn-sm">⬇ Download</a>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShareItem(buildShareItem({
                        title: `📄 ${n.title}`,
                        description: `Note on UClass: ${n.title}`,
                        fileKind: 'notes',
                        filePath: n.file_path,
                        classId: id,
                        tab: 'Notes',
                      }))}
                    >📱 Social Media</button>
                  </div>
                )}
              </div>
            ))
        )}

        {tab === 'Homework' && (
          data.length === 0
            ? <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No homework yet.</p>
            : data.map(hw => {
              const st = subState[hw.id] || { submitting: false, form: { text: '', file: null }, mySubmission: null };
              const dueStatus = getDueStatus(hw.due_date);
              const sub = st.mySubmission;
              return (
                <div key={hw.id} className="item-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  {/* Homework info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div className="item-card-body" style={{ flex: 1 }}>
                      <h3>📝 {hw.title}</h3>
                      {hw.description && <p>{hw.description}</p>}
                      {dueStatus && (
                        <div className="meta" style={{ color: dueStatus.color, fontWeight: 600 }}>
                          ⏰ {dueStatus.label}
                        </div>
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
                              }))}
                            >📱 Social Media</button>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Submission badge */}
                    <div style={{ flexShrink: 0 }}>
                      {sub
                        ? sub.grade !== null && sub.grade !== undefined
                          ? <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                              ✅ Graded: {sub.grade}/100
                            </span>
                          : <span style={{ background: '#fef9c3', color: '#92400e', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                              ✔ Submitted
                            </span>
                        : <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                            ✗ Not submitted
                          </span>
                      }
                    </div>
                  </div>

                  {/* Grade & feedback display */}
                  {sub && sub.grade !== null && sub.grade !== undefined && (
                    <div style={{ margin: '12px 0 0', padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, borderLeft: '4px solid #22c55e' }}>
                      <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>Grade: {sub.grade}/100</div>
                      {sub.feedback && <div style={{ color: '#374151', fontSize: 14 }}>💬 Feedback: {sub.feedback}</div>}
                    </div>
                  )}

                  {/* Submitted file/text display */}
                  {sub && (
                    <div style={{ margin: '10px 0 0', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#475569' }}>
                      <strong>Your submission:</strong>
                      {sub.text_response && <p style={{ margin: '4px 0 0' }}>{sub.text_response}</p>}
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
                          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setPreviewDoc({ fileUrl: `${UPLOADS_BASE}/download/homework/${sub.file_path}?inline=1`, fileName: sub.file_name })}
                            >👁 Preview</button>
                            <a href={`${UPLOADS_BASE}/download/homework/${sub.file_path}`} download={sub.file_name} className="btn btn-primary btn-sm">⬇ Download</a>
                          </div>
                        </>
                      )}
                      <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 12 }}>
                        Submitted: {new Date(sub.submitted_at).toLocaleString()}
                      </div>
                    </div>
                  )}

                  {/* Submission form */}
                  <form onSubmit={(e) => submitHomework(e, hw.id)}
                    style={{ marginTop: 14, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1.5px dashed #cbd5e1' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', marginBottom: 10 }}>
                      {sub ? '✏️ Update your submission' : '📤 Submit your work'}
                    </div>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <textarea
                        placeholder="Write your answer here... (optional if uploading a file)"
                        value={st.form.text}
                        onChange={e => setSubState(prev => ({ ...prev, [hw.id]: { ...prev[hw.id], form: { ...prev[hw.id].form, text: e.target.value } } }))}
                        rows={3}
                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
                        onChange={e => setSubState(prev => ({ ...prev, [hw.id]: { ...prev[hw.id], form: { ...prev[hw.id].form, file: e.target.files[0] } } }))}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={st.submitting}>
                      {st.submitting ? 'Submitting...' : sub ? 'Resubmit' : 'Submit'}
                    </button>
                  </form>
                </div>
              );
            })
        )}

        {tab === 'Groups' && (
          <StudentMyGroupsPanel
            groups={myGroups}
            classId={id}
            className={cls?.name}
            token={token}
            loading={groupsLoading}
            error={groupsError}
            initialGroupId={searchParams.get('group')}
          />
        )}

        {tab === 'Quizzes' && (
          quizzesLoading ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>Loading quizzes…</p>
          ) : !groupQuizzes.length && !data.length ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No quizzes yet.</p>
          ) : (
            <>
              {groupQuizzes.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 17, color: '#065f46' }}>👥 Team quizzes</h3>
                  <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                    Work with your group — open, answer together, and submit once.
                  </p>
                  <StudentGroupQuizCards assignments={groupQuizzes} classId={id} />
                </section>
              )}
              {data.length > 0 && (
                <section>
                  {groupQuizzes.length > 0 && (
                    <h3 style={{ margin: '0 0 12px', fontSize: 17, color: '#1e293b' }}>❓ Class quizzes</h3>
                  )}
                  {data.map((q) => (
                    <div key={q.id} className="item-card">
                      <div className="item-card-body">
                        <h3>❓ {q.title}</h3>
                        <SharedQuizAttribution quiz={q} />
                        {q.description && <p>{q.description}</p>}
                        <div className="meta">{new Date(q.created_at).toLocaleDateString()}</div>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/student/classes/${id}/quizzes/${q.id}`)}>
                        Take Quiz
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )
        )}

        {tab === 'Leaderboard' && (
          <ClassLeaderboard classId={id} />
        )}

        {tab === 'Discussion' && (
          <>
            <div className="discussion-list">
              {data.map(d => (
                <div key={d.id} className="discussion-msg">
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

        {tab === 'Classmates' && (
          <div className="wa-class-list">
            {classmates.length === 0 && (
              <p className="wa-section-hint">No classmates yet.</p>
            )}
            {classmates.map((p) => (
              <button
                key={p.id}
                type="button"
                className="wa-class-row wa-class-row--mate"
                onClick={() => setSelectedPerson(p)}
              >
                <div className="wa-class-avatar wa-class-avatar--mate">
                  <img
                    src={p.avatar_path ? `${UPLOADS_BASE}${p.avatar_path}` : CLASSMATE_DEFAULT_AVATAR}
                    alt=""
                  />
                </div>
                <div className="wa-class-body">
                  <strong>{p.name}</strong>
                  <span className="wa-preview">
                    {p.role === 'teacher' ? 'Teacher' : 'Classmate'} · Tap to view profile
                  </span>
                </div>
                <span className="wa-class-time">›</span>
              </button>
            ))}
          </div>
        )}

        <ClassMomentsClassFold classId={id} token={token} className={cls?.name} />
      </main>

      {selectedPerson && (
        <ClassmateProfileModal
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onMessage={(uid) => { setSelectedPerson(null); navigate('/messages', { state: { toUserId: uid } }); }}
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
    </div>
  );
}
