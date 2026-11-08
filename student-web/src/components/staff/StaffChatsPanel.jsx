import { useState, useEffect, useRef } from 'react';
import { api, UPLOADS_BASE } from '../../api';
import { useAuth } from '../../context/AuthContext';
import '../../styles/WaChatShell.css';
import '../../pages/Messages.css';
import MessageContextBanner from '../MessageContextBanner';
import '../../pages/ParentHub.css';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%2325d366'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

export default function StaffChatsPanel({ token }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [thread, setThread] = useState([]);
  const [text, setText] = useState('');
  const [mobilePanel, setMobilePanel] = useState('list');
  const bottomRef = useRef();
  const shouldScrollOnSendRef = useRef(false);

  const scrollThreadToBottom = (behavior = 'auto') => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  };

  const openChat = (contactId) => {
    setActiveChat(contactId);
    setMobilePanel('chat');
    setTimeout(() => scrollThreadToBottom('auto'), 0);
  };

  // Messenger-style list: people who messaged (most recent first) on top, then everyone else
  const [convos, setConvos] = useState([]);
  const [peerOnline, setPeerOnline] = useState(null);

  useEffect(() => {
    const load = () => Promise.all([
      api.get('/profile/contacts/list', token).catch(() => []),
      api.get('/messages/inbox', token).catch(() => []),
      api.get('/parent/school/parents', token).catch(() => []),
    ]).then(([profileContacts, inbox, parents]) => {
      setConvos(inbox || []);
      const byId = Object.fromEntries((inbox || []).map((m) => [m.sender_id, m]));
      const map = new Map();
      profileContacts.forEach((c) => map.set(c.id, c));
      parents.forEach((p) => {
        if (!map.has(p.id)) {
          map.set(p.id, { id: p.id, name: p.name, role: 'parent', student_hint: p.student_name });
        }
      });
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
      // sort: conversations first (recent first), then the rest alphabetically
      const convoIds = new Set((inbox || []).map((m) => m.sender_id));
      const all = [...map.values()];
      all.sort((a, b) => {
        const ac = byId[a.id]?.created_at, bc = byId[b.id]?.created_at;
        if (ac && bc) return new Date(bc) - new Date(ac);
        if (ac) return -1;
        if (bc) return 1;
        return a.name.localeCompare(b.name);
      });
      all.forEach((c) => { c.unread = byId[c.id]?.unread_count || 0; c.preview = byId[c.id]?.content || ''; c.online = byId[c.id]?.is_online; });
      setContacts(all);
    });
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [token]);

  // live online status for the open chat header
  useEffect(() => {
    if (!activeChat) { setPeerOnline(null); return undefined; }
    const load = () => api.get(`/presence/status/${activeChat}`, token).then((r) => setPeerOnline(!!r?.is_online)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [activeChat, token]);

  useEffect(() => {
    if (!activeChat) return;
    let firstLoad = true;
    const load = () => api.get(`/messages/thread/${activeChat}`, token).then((msgs) => {
      setThread(msgs);
      if (firstLoad) {
        firstLoad = false;
        scrollThreadToBottom('auto');
      }
    }).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [activeChat, token]);

  useEffect(() => {
    if (!shouldScrollOnSendRef.current) return;
    shouldScrollOnSendRef.current = false;
    scrollThreadToBottom('smooth');
  }, [thread]);

  const sendMsg = async (e) => {
    e.preventDefault();
    if (!activeChat || !text.trim()) return;
    try {
      const msg = await api.post('/messages', { receiver_id: activeChat, content: text.trim() }, token);
      setThread((t) => [...t, { ...msg, sender_name: user?.name }]);
      setText('');
      shouldScrollOnSendRef.current = true;
    } catch (err) {
      alert(err.message);
    }
  };

  const activeContact = contacts.find((c) => c.id === activeChat);
  const latestCtx = [...thread].reverse().find((m) => m.context_json)?.context_json;

  return (
    <div className="msg-page phub-chat-wrap wa-chat-shell msg-page--hub-embed">
      <div className={`msg-sidebar ${mobilePanel === 'chat' ? 'msg-sidebar-hidden' : ''}`}>
        <div className="msg-sidebar-header">
          <span>Chats</span>
        </div>
        {contacts.length === 0 && (
          <p className="msg-empty">No conversations yet. Notify parents or wait for them to message you.</p>
        )}
        {contacts.map((c) => (
          <div
            key={c.id}
            className={`msg-contact ${activeChat === c.id ? 'active' : ''}`}
            onClick={() => openChat(c.id)}
          >
            <span style={{ position: 'relative', flexShrink: 0 }}>
              <img src={c.avatar_path ? `${UPLOADS_BASE}${c.avatar_path}` : DEFAULT_AVATAR} alt="" className="msg-contact-avatar" />
              {c.online && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, background: '#22c55e', borderRadius: '50%', border: '2px solid #fff' }} />}
            </span>
            <div className="msg-contact-info">
              <span className="msg-contact-name">{c.name}</span>
              <span className="msg-contact-role">
                {c.preview ? String(c.preview).slice(0, 40) : (c.role?.replace('_', ' '))}
                {!c.preview && c.student_hint ? ` · ${c.student_hint}` : ''}
              </span>
            </div>
            {c.unread > 0 && (
              <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '1px 7px', minWidth: 20, textAlign: 'center' }}>{c.unread}</span>
            )}
          </div>
        ))}
      </div>
      <div className={`msg-chat ${mobilePanel === 'list' ? 'msg-chat-hidden' : ''}`}>
        {!activeChat ? (
          <div className="msg-no-chat">Select a parent or colleague to chat</div>
        ) : (
          <>
            <div className="phub-chat-header wa-chat-header">
              <button type="button" className="msg-back-btn" onClick={() => setMobilePanel('list')}>←</button>
              <div>
                <strong>{activeContact?.name}</strong>
                <div className="phub-chat-meta">
                  {peerOnline ? (
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>● online now</span>
                  ) : 'offline'}
                  {' · '}{activeContact?.role?.replace('_', ' ')}
                </div>
              </div>
            </div>
            <div className="wa-chat-body">
              <MessageContextBanner ctx={latestCtx} />
              <div className="msg-thread wa-messages">
                {thread.map((m) => (
                  <div key={m.id} className={`msg-bubble-wrap ${m.sender_id === user?.id ? 'mine' : 'theirs'}`}>
                    {m.context_json && m.sender_id !== user?.id && (
                      <MessageContextBanner ctx={m.context_json} />
                    )}
                    <div className={`msg-bubble ${m.sender_id === user?.id ? 'sent' : 'received'}`}>
                      {m.content && <p>{m.content}</p>}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
            <form className="msg-input-row wa-input-bar" onSubmit={sendMsg}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message…"
              />
              <button type="submit" className="msg-send-btn" disabled={!text.trim()}>
                ➤
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
