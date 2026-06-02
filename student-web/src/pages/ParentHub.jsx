import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, UPLOADS_BASE } from '../api';
import { ParentChildFeed } from './ParentDashboard';
import { useAuth } from '../context/AuthContext';
import DonateButton from '../components/DonateButton';
import MessageContextBanner from '../components/MessageContextBanner';
import '../pages/Messages.css';
import { downloadWord, downloadCatSheetWord } from '../utils/downloadResult';
import ClassMomentsHero from '../components/classMoments/ClassMomentsHero';
import { useClassMomentAlerts } from '../hooks/useClassMomentAlerts';
import { classMomentDetailPath } from '../utils/classMomentPaths';
import '../components/classMoments/ClassMoments.css';
import './ParentHub.css';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%234285f4'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

function dedupeTeachers(list) {
  const map = new Map();
  (list || []).forEach((t) => {
    if (!t?.id) return;
    const prev = map.get(t.id);
    if (!prev) {
      map.set(t.id, { ...t });
      return;
    }
    const classes = [prev.class_name, t.class_name].filter(Boolean);
    const uniqueClasses = [...new Set(classes)];
    map.set(t.id, {
      ...prev,
      ...t,
      email: t.email || prev.email,
      phone: t.phone || prev.phone,
      class_name: uniqueClasses.length > 1 ? uniqueClasses.join(', ') : (uniqueClasses[0] || null),
      student_name: t.student_name || prev.student_name,
    });
  });
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export default function ParentHub() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [momentPreview, setMomentPreview] = useState(null);
  const [tab, setTab] = useState('chats');
  const [hub, setHub] = useState(null);
  const [selectedChild, setSelectedChild] = useState(null);
  const [summary, setSummary] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [thread, setThread] = useState([]);
  const [text, setText] = useState('');
  const [mobilePanel, setMobilePanel] = useState('list');
  const [marksPeriod, setMarksPeriod] = useState('week');
  const [downloadingMarks, setDownloadingMarks] = useState(false);
  const [downloadingQuiz, setDownloadingQuiz] = useState(null);
  const bottomRef = useRef();
  const threadRef = useRef();

  const loadHub = () => {
    api.get('/parent/hub', token).then((data) => {
      setHub(data);
      if (data.children?.length && !selectedChild) {
        setSelectedChild(data.children[0].id);
      }
    }).catch(() => {});
  };

  useClassMomentAlerts(token, user?.role);

  useEffect(() => { loadHub(); }, [token]);
  useEffect(() => {
    api.get('/class-moments/preview', token).then(setMomentPreview).catch(() => {});
  }, [token]);
  useEffect(() => {
    const momentId = searchParams.get('moment');
    if (momentId) {
      navigate(classMomentDetailPath('parent', momentId), { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!hub?.teachers?.length) return;
    setContacts((prev) => {
      const map = new Map(prev.map((c) => [c.id, { ...c }]));
      hub.teachers.forEach((t) => {
        const cur = map.get(t.id) || { id: t.id, name: t.name, role: t.role };
        map.set(t.id, {
          ...cur,
          name: t.name || cur.name,
          role: t.role || cur.role,
          email: t.email || cur.email,
          phone: t.phone || cur.phone,
        });
      });
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, [hub?.teachers]);

  useEffect(() => {
    if (typeof Notification === 'undefined' || !hub?.unread_notifications_count) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    if (Notification.permission === 'granted' && hub.unread_notifications_count > 0) {
      const latest = hub.notifications?.find((n) => !n.is_read);
      if (latest) {
        try {
          const n = new Notification(latest.title, { body: latest.body, tag: `parent-${latest.id}` });
          if (latest.type === 'class_moment' && latest.payload?.moment_id) {
            const momentId = latest.payload.moment_id;
            n.onclick = () => {
              window.focus();
              navigate(classMomentDetailPath('parent', momentId));
            };
          }
        } catch {
          /* ignore */
        }
      }
    }
  }, [hub?.unread_notifications_count, hub?.notifications, navigate]);
  useEffect(() => {
    Promise.all([
      api.get('/profile/contacts/list', token).catch(() => []),
      api.get('/messages/inbox', token).catch(() => []),
    ]).then(([profileContacts, inbox]) => {
      const map = new Map();
      profileContacts.forEach((c) => map.set(c.id, c));
      inbox.forEach((m) => {
        if (!map.has(m.sender_id)) {
          map.set(m.sender_id, {
            id: m.sender_id,
            name: m.sender_name,
            role: m.sender_role,
            avatar_path: m.avatar_path,
          });
        }
      });
      setContacts([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [token]);

  const unreadNotif = hub?.unread_notifications_count ?? 0;

  const openNotification = async (n) => {
    if (!n.is_read) {
      await api.put(`/parent/notifications/${n.id}/read`, {}, token).catch(() => {});
      loadHub();
    }
    if (n.type === 'class_moment') {
      const momentId = n.payload?.moment_id;
      if (momentId) {
        navigate(classMomentDetailPath('parent', momentId));
        return;
      }
    }
    if (n.sender_id) {
      setTab('chats');
      setActiveChat(n.sender_id);
      setMobilePanel('chat');
    }
  };

  useEffect(() => {
    if (!selectedChild) return;
    api.get(`/parent/children/${selectedChild}/summary?period=${marksPeriod}`, token)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [selectedChild, marksPeriod, token]);

  useEffect(() => {
    if (!activeChat) return;
    const load = () => api.get(`/messages/thread/${activeChat}`, token).then(setThread).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [activeChat, token]);

  const scrollThreadToBottom = (behavior = 'auto') => {
    requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  };

  const openChat = (contactId) => {
    setActiveChat(contactId);
    setMobilePanel('chat');
    setTimeout(() => scrollThreadToBottom('auto'), 0);
  };

  useEffect(() => {
    if (!activeChat) return;
    scrollThreadToBottom('auto');
  }, [activeChat]);

  useEffect(() => {
    scrollThreadToBottom('smooth');
  }, [thread]);

  const sendMsg = async (e) => {
    e.preventDefault();
    if (!activeChat || !text.trim()) return;
    try {
      const msg = await api.post('/messages', { receiver_id: activeChat, content: text.trim() }, token);
      setThread((t) => [...t, { ...msg, sender_name: user?.name }]);
      setText('');
    } catch (err) {
      alert(err.message);
    }
  };

  const markAllRead = () => {
    api.put('/parent/notifications/read-all', {}, token).then(loadHub).catch(() => {});
  };

  const child = hub?.children?.find((c) => c.id === selectedChild);
  const latestCtx = [...thread].reverse().find((m) => m.context_json)?.context_json;
  const activeContact = contacts.find((c) => c.id === activeChat);
  const teachers = dedupeTeachers([...(hub?.teachers || []), ...(summary?.teachers || [])]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const hasLinkedChild = (hub?.children?.length ?? 0) > 0;

  const downloadMarksWord = async () => {
    if (!selectedChild) return;
    setDownloadingMarks(true);
    try {
      const data = await api.get(`/parent/children/${selectedChild}/marks-export`, token);
      if (!data.exports?.length) {
        alert('No CAT marks recorded yet for this child.');
        return;
      }
      const safeName = (data.student_name || 'child').replace(/\s+/g, '_');
      data.exports.forEach((exp, i) => {
        const fname = `${safeName}_${(exp.class_name || 'class').replace(/\s+/g, '_')}${data.exports.length > 1 ? `_${i + 1}` : ''}`;
        downloadCatSheetWord(fname, exp);
      });
    } catch (err) {
      alert(err.message || 'Could not download marks record.');
    } finally {
      setDownloadingMarks(false);
    }
  };

  const downloadQuizWord = async (quizId, title) => {
    if (!selectedChild || !quizId) return;
    setDownloadingQuiz(quizId);
    try {
      const data = await api.get(`/parent/children/${selectedChild}/quizzes/${quizId}/report`, token);
      const safeName = (data.student_name || 'student').replace(/\s+/g, '_');
      downloadWord(`${data.quiz_title || title}_${safeName}`, data);
    } catch (err) {
      alert(err.message || 'Could not download quiz report.');
    } finally {
      setDownloadingQuiz(null);
    }
  };

  const renderTeacherContact = (t, key) => (
    <div key={key} className="phub-teacher-card">
      <div className="phub-teacher-card-head">
        <strong>{t.name}</strong>
        <span className="phub-teacher-role">{(t.role || 'teacher').replace('_', ' ')}</span>
      </div>
      {t.class_name && (
        <p className="phub-muted phub-teacher-meta">{t.class_name}{t.subject ? ` · ${t.subject}` : ''}</p>
      )}
      {t.student_name && <p className="phub-muted phub-teacher-meta">Child: {t.student_name}</p>}
      <div className="phub-teacher-actions">
        {t.email && (
          <a href={`mailto:${t.email}`} className="phub-contact-link">✉ {t.email}</a>
        )}
        {t.phone && (
          <a href={`tel:${String(t.phone).replace(/\s/g, '')}`} className="phub-contact-link">📞 {t.phone}</a>
        )}
        {!t.email && !t.phone && <span className="phub-muted">No contact details on file</span>}
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => openChat(t.id)}
        >
          💬 Message
        </button>
      </div>
    </div>
  );

  return (
    <div className={`phub-page wa-theme${tab === 'chats' ? ' phub-page--chats' : ''}`}>
      <header className="phub-header">
        <div className="phub-brand">
          <span className="phub-logo">UClass</span>
          <span className="phub-sub">Parent</span>
        </div>
        <div className="phub-header-actions">
          <Link to="/messages" className="btn btn-secondary btn-sm">💬 All messages</Link>
          <Link to="/parent/legacy" className="btn btn-outline btn-sm">Classic feed</Link>
          <DonateButton />
          <button type="button" className="btn btn-outline btn-sm" onClick={logout}>Logout</button>
        </div>
      </header>

      <nav className="phub-nav">
        {['chats', 'feed', 'school', 'child'].map((t) => (
          <button
            key={t}
            type="button"
            className={`phub-nav-btn ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); setMobilePanel('list'); }}
          >
            {t === 'chats' && '💬 Chats'}
            {t === 'feed' && '📰 Classroom feed'}
            {t === 'school' && '🏫 School'}
            {t === 'child' && '👧 My child'}
            {t === 'school' && unreadNotif > 0 && (
              <span className="phub-badge">{unreadNotif}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="phub-moments-hero-wrap">
        <ClassMomentsHero preview={momentPreview} feedPath="/parent/class-moments" />
      </div>

      {hasLinkedChild && (
        <section className="phub-teachers-strip" aria-label="School teachers">
          <h2 className="phub-teachers-strip-title">Your child&apos;s teachers — email &amp; phone</h2>
          {teachers.length > 0 ? (
            <div className="phub-teachers-scroll">
              {teachers.map((t) => renderTeacherContact(t, `t-${t.id}-${t.class_name || 's'}`))}
            </div>
          ) : (
            <p className="phub-muted" style={{ margin: 0, fontSize: 13 }}>
              No teachers linked yet. Ask the school to add your child to a class.
            </p>
          )}
        </section>
      )}

      <div className="phub-body">
        {tab === 'chats' && (
          <div className="msg-page phub-chat-wrap wa-chat-shell msg-page--hub-embed phub-chat-wrap--full">
            <div className={`msg-sidebar ${mobilePanel === 'chat' ? 'msg-sidebar-hidden' : ''}`}>
              <div className="msg-sidebar-header">
                <span>Chats</span>
                {hub?.notifications?.some((n) => !n.is_read) && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead}>Mark read</button>
                )}
              </div>
              {contacts.length === 0 && (
                <p className="msg-empty">No school contacts yet. Use your child&apos;s parent invite from the teacher.</p>
              )}
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className={`msg-contact ${activeChat === c.id ? 'active' : ''}`}
                  onClick={() => openChat(c.id)}
                >
                  <img src={c.avatar_path ? `${UPLOADS_BASE}${c.avatar_path}` : DEFAULT_AVATAR} alt="" className="msg-contact-avatar" />
                  <div className="msg-contact-info">
                    <span className="msg-contact-name">{c.name}</span>
                    <span className="msg-contact-role">{c.role?.replace('_', ' ')}</span>
                    {(c.email || c.phone) && (
                      <span className="msg-contact-sub">{c.email || c.phone}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className={`msg-chat ${mobilePanel === 'list' ? 'msg-chat-hidden' : ''}`}>
              {!activeChat ? (
                <div className="msg-no-chat">Select a conversation with your school</div>
              ) : (
                <>
                  <div className="phub-chat-header wa-chat-header">
                    <button type="button" className="msg-back-btn" onClick={() => setMobilePanel('list')}>←</button>
                    <div className="phub-chat-header-main">
                      <strong>{activeContact?.name}</strong>
                      {(child || latestCtx) && (
                        <div className="phub-chat-meta">
                          {child && <>Child: {child.name}</>}
                          {(child?.school_name || latestCtx?.school_name) && (
                            <> · {child?.school_name || latestCtx?.school_name}</>
                          )}
                        </div>
                      )}
                      {(activeContact?.email || activeContact?.phone || contactById.get(activeChat)?.email) && (
                        <div className="phub-chat-contact-row">
                          {(activeContact?.email || contactById.get(activeChat)?.email) && (
                            <a href={`mailto:${activeContact?.email || contactById.get(activeChat)?.email}`}>
                              ✉ {activeContact?.email || contactById.get(activeChat)?.email}
                            </a>
                          )}
                          {(activeContact?.phone || contactById.get(activeChat)?.phone) && (
                            <a href={`tel:${String(activeContact?.phone || contactById.get(activeChat)?.phone).replace(/\s/g, '')}`}>
                              📞 {activeContact?.phone || contactById.get(activeChat)?.phone}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="wa-chat-body">
                    <MessageContextBanner ctx={latestCtx} />
                    <div ref={threadRef} className="msg-thread msg-messages wa-messages">
                      {thread.map((m) => (
                        <div key={m.id}>
                          {m.context_json && m.sender_id !== user?.id && (
                            <MessageContextBanner ctx={m.context_json} />
                          )}
                          <div className={`msg-bubble ${m.sender_id === user?.id ? 'sent' : 'received'}`}>
                            {m.content}
                          </div>
                        </div>
                      ))}
                      <div ref={bottomRef} />
                    </div>
                  </div>
                  <form className="msg-input-row msg-input-bar wa-input-bar" onSubmit={sendMsg}>
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
                    <button type="submit" className="msg-send-btn" disabled={!text.trim()} aria-label="Send">
                      ➤
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'feed' && (
          <div className="phub-panel">
            <p className="phub-muted" style={{ marginBottom: 12 }}>
              Posts your child shared in class — not other students&apos; work.
            </p>
            {hub?.children?.length > 1 && (
              <label className="phub-select-label">
                Child
                <select value={selectedChild || ''} onChange={(e) => setSelectedChild(Number(e.target.value))}>
                  {hub.children.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            {selectedChild ? (
              <ParentChildFeed studentId={selectedChild} token={token} />
            ) : (
              <p className="phub-muted">Connect your child using the teacher&apos;s parent invite link.</p>
            )}
          </div>
        )}

        {tab === 'school' && (
          <div className="phub-panel">
            {teachers.length > 0 && (
              <section className="phub-section" style={{ marginTop: 0 }}>
                <h2>Teachers — contact</h2>
                <div className="phub-teachers-grid">
                  {teachers.map((t) => renderTeacherContact(t, `school-t-${t.id}`))}
                </div>
              </section>
            )}
            <h2>School announcements</h2>
            {hub?.announcements?.length ? hub.announcements.map((a) => (
              <article key={a.id} className={`phub-card ${a.is_pinned ? 'phub-pinned' : ''}`}>
                {a.is_pinned && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>📌 PINNED</span>}
                <strong>{a.title}</strong>
                <p>{a.body}</p>
                <small>{a.school_name} · {new Date(a.created_at).toLocaleString()}</small>
              </article>
            )) : <p className="phub-muted">No school announcements yet.</p>}

            <h2 style={{ marginTop: 24 }}>Notifications</h2>
            {hub?.notifications?.length ? hub.notifications.map((n) => (
              <article
                key={n.id}
                role="button"
                tabIndex={0}
                className={`phub-card ${n.is_read ? '' : 'phub-card-unread'}`}
                onClick={() => openNotification(n)}
                onKeyDown={(e) => e.key === 'Enter' && openNotification(n)}
                style={{ cursor: n.sender_id ? 'pointer' : 'default' }}
              >
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{new Date(n.created_at).toLocaleString()}</small>
              </article>
            )) : <p className="phub-muted">No notifications yet.</p>}
          </div>
        )}

        {tab === 'child' && (
          <div className="phub-panel">
            {hub?.children?.length > 1 && (
              <label className="phub-select-label">
                Child
                <select value={selectedChild || ''} onChange={(e) => setSelectedChild(Number(e.target.value))}>
                  {hub.children.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            {!child ? (
              <p>Use the invitation link from your child&apos;s teacher to connect.</p>
            ) : (
              <>
                <div className="phub-card phub-child-hero">
                  <h2>{child.name}</h2>
                  <p>{child.school_name || 'School'}</p>
                  {(child.district || child.sector) && (
                    <p className="phub-muted">{[child.district, child.sector].filter(Boolean).join(' · ')}</p>
                  )}
                  <div className="phub-download-row">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={downloadingMarks}
                      onClick={downloadMarksWord}
                    >
                      {downloadingMarks ? 'Preparing…' : '⬇ Download marks record (Word)'}
                    </button>
                  </div>
                </div>

                {teachers.length > 0 && (
                  <section className="phub-section">
                    <h3>Teachers — email &amp; phone</h3>
                    <div className="phub-teachers-grid">
                      {teachers.map((t) => renderTeacherContact(t, `child-t-${t.id}-${t.class_name || 'x'}`))}
                    </div>
                  </section>
                )}

                {summary && (
                  <>
                    <div className="phub-period-tabs">
                      {[
                        { id: 'today', label: 'Today' },
                        { id: 'week', label: 'This week' },
                        { id: 'term', label: 'This term' },
                        { id: 'all', label: 'All' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={marksPeriod === p.id ? 'active' : ''}
                          onClick={() => setMarksPeriod(p.id)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <section className="phub-section">
                      <h3>Quizzes</h3>
                      {summary.quizzes?.length ? summary.quizzes.map((q, i) => (
                        <div key={q.quiz_id || i} className="phub-row phub-row--quiz">
                          <span>{q.class_name} — {q.title}: <strong>{q.score}{q.total ? `/${q.total}` : '%'}</strong></span>
                          {q.quiz_id && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={downloadingQuiz === q.quiz_id}
                              onClick={() => downloadQuizWord(q.quiz_id, q.title)}
                            >
                              {downloadingQuiz === q.quiz_id ? '…' : '⬇ Word'}
                            </button>
                          )}
                        </div>
                      )) : <p className="phub-muted">No quiz attempts yet.</p>}
                    </section>
                    <section className="phub-section">
                      <h3>Homework</h3>
                      {summary.homework?.length ? summary.homework.map((h, i) => (
                        <div key={i} className="phub-row">{h.class_name} — {h.title} {h.grade != null ? `(grade: ${h.grade})` : h.submitted_at ? '✓ submitted' : '· due ' + (h.due_date || '')}</div>
                      )) : <p className="phub-muted">No homework yet.</p>}
                    </section>
                    <section className="phub-section">
                      <h3>Marks (CAT)</h3>
                      {summary.marks?.length ? summary.marks.map((m, i) => (
                        <div key={i} className="phub-row">{m.class_name} test {m.test_number}: {m.marks_obtained}/{m.total_marks}</div>
                      )) : <p className="phub-muted">No marks recorded.</p>}
                    </section>
                    <section className="phub-section">
                      <h3>Weekly teacher updates</h3>
                      {summary.weekly_digests?.length ? summary.weekly_digests.map((d, i) => {
                        let j = d.digest_json || {};
                        if (typeof j === 'string') {
                          try { j = JSON.parse(j); } catch { j = {}; }
                        }
                        return (
                          <div key={i} className="phub-card" style={{ marginBottom: 8 }}>
                            <small>{new Date(d.created_at).toLocaleDateString()}</small>
                            {j.behavior_note && <p><strong>Behavior:</strong> {j.behavior_note}</p>}
                            {j.work_summary && <p><strong>Work:</strong> {j.work_summary}</p>}
                            {j.attendance && <p><strong>Attendance:</strong> {j.attendance}</p>}
                            {j.gaps && <p><strong>Next:</strong> {j.gaps}</p>}
                          </div>
                        );
                      }) : <p className="phub-muted">No weekly updates yet.</p>}
                    </section>
                    <section className="phub-section">
                      <h3>Compositions & shares</h3>
                      {summary.compositions?.length ? summary.compositions.map((c, i) => (
                        <div key={i} className="phub-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                          <span><strong>{c.title || 'Share'}</strong> · {c.status}</span>
                          {c.body && (
                            <span className="phub-muted" style={{ fontSize: 13, marginTop: 4 }}>
                              {String(c.body).slice(0, 200)}{String(c.body).length > 200 ? '…' : ''}
                            </span>
                          )}
                        </div>
                      )) : <p className="phub-muted">No compositions or drawings yet.</p>}
                    </section>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
