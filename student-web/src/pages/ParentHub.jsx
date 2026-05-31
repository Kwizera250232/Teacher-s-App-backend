import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, UPLOADS_BASE } from '../api';
import { ParentChildFeed } from './ParentDashboard';
import { useAuth } from '../context/AuthContext';
import DonateButton from '../components/DonateButton';
import MessageContextBanner from '../components/MessageContextBanner';
import '../pages/Messages.css';
import DeanSupportFab from '../components/DeanSupportFab';
import '../styles/WaChatShell.css';
import './ParentHub.css';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%234285f4'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

export default function ParentHub() {
  const { user, token, logout } = useAuth();
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
  const bottomRef = useRef();

  const loadHub = () => {
    api.get('/parent/hub', token).then((data) => {
      setHub(data);
      if (data.children?.length && !selectedChild) {
        setSelectedChild(data.children[0].id);
      }
    }).catch(() => {});
  };

  useEffect(() => { loadHub(); }, [token]);

  useEffect(() => {
    if (typeof Notification === 'undefined' || !hub?.unread_notifications_count) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    if (Notification.permission === 'granted' && hub.unread_notifications_count > 0) {
      const latest = hub.notifications?.find((n) => !n.is_read);
      if (latest) {
        try {
          new Notification(latest.title, { body: latest.body, tag: `parent-${latest.id}` });
        } catch {
          /* ignore */
        }
      }
    }
  }, [hub?.unread_notifications_count]);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  return (
    <div className="phub-page wa-theme">
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

      <div className="phub-body">
        {tab === 'chats' && (
          <div className="msg-page phub-chat-wrap wa-chat-shell msg-page--hub-embed">
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
                  onClick={() => { setActiveChat(c.id); setMobilePanel('chat'); }}
                >
                  <img src={c.avatar_path ? `${UPLOADS_BASE}${c.avatar_path}` : DEFAULT_AVATAR} alt="" className="msg-contact-avatar" />
                  <div className="msg-contact-info">
                    <span className="msg-contact-name">{c.name}</span>
                    <span className="msg-contact-role">{c.role?.replace('_', ' ')}</span>
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
                    <div>
                      <strong>{activeContact?.name}</strong>
                      {(child || latestCtx) && (
                        <div className="phub-chat-meta">
                          {child && <>Child: {child.name}</>}
                          {(child?.school_name || latestCtx?.school_name) && (
                            <> · {child?.school_name || latestCtx?.school_name}</>
                          )}
                          {(child?.district || latestCtx?.district) && (
                            <> · {[child?.district || latestCtx?.district, child?.sector || latestCtx?.sector].filter(Boolean).join(' / ')}</>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="wa-chat-body">
                    <MessageContextBanner ctx={latestCtx} />
                    <div className="msg-thread msg-messages wa-messages">
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
                </div>
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
                        <div key={i} className="phub-row">{(q.class_name)} — {q.title}: <strong>{q.score}%</strong></div>
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
          <DeanSupportFab token={token} />
    </div>
  );
}
