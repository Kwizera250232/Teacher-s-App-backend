import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, uploadFile, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import ClassmateProfileModal from '../components/ClassmateProfileModal';
import ShareCompositionModal from '../components/ShareCompositionModal';
import '../styles/WaChatShell.css';
import './Messages.css';

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23667eea'/%3E%3Ctext y='.9em' font-size='50' x='25' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

const EMOJI_LIST = [
  '😀','😂','😍','🥰','😎','🤔','😊','😅','🥹','😭','😤','🤩','😢','😡','🤗',
  '👍','👎','👏','🙌','🤝','🙏','💪','🫶','❤️','🧡','💛','💚','💙','💜','🖤',
  '🎉','🎊','🏆','🌟','⭐','✅','❌','⚠️','📚','✏️','🎓','📖','🏫','💡','🔥',
  '😴','😷','🤒','🤓','👀','💀','👻','🐱','🐶','🦁','🌈','⚽','🏀','🎮','🎵',
];

export default function Messages() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [contacts, setContacts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  // Mobile: which panel is visible — 'list' or 'chat'
  const [mobilePanel, setMobilePanel] = useState('list');
  const [profilePerson, setProfilePerson] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showShareComposition, setShowShareComposition] = useState(false);
  const bottomRef = useRef();
  const threadRef = useRef();
  const fileRef = useRef();
  const emojiRef = useRef();
  const inboxDataRef = useRef({});
  const shouldScrollOnSendRef = useRef(false);

  const scrollThreadToBottom = (behavior = 'auto') => {
    requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  };

  const openChat = (contactId) => {
    setActiveId(contactId);
    setMobilePanel('chat');
    setTimeout(() => scrollThreadToBottom('auto'), 0);
  };

  useEffect(() => {
    Promise.all([
      api.get('/profile/contacts/list', token),
      api.get('/messages/inbox', token),
    ]).then(([contactList, inboxList]) => {
      setInbox(inboxList);      inboxDataRef.current = Object.fromEntries(inboxList.map(m => [m.sender_id, m]));      // Merge inbox senders not already in contacts so unread messages are always reachable
      const existingIds = new Set(contactList.map(c => c.id));
      const extra = inboxList
        .filter(m => !existingIds.has(m.sender_id))
        .map(m => ({ id: m.sender_id, name: m.sender_name, role: m.sender_role, avatar_path: m.avatar_path }));
      setContacts([...contactList, ...extra]);
    }).catch(() => {});
    const uid = searchParams.get('to');
    if (uid) openChat(parseInt(uid, 10));
  }, [token]);

  useEffect(() => {
    if (!activeId) return;
    let firstLoad = true;
    const load = () => {
      api.get(`/messages/thread/${activeId}`, token).then(msgs => {
        setThread(msgs);
        setInbox(prev => prev.filter(m => m.sender_id !== activeId));
        if (firstLoad) {
          firstLoad = false;
          scrollThreadToBottom('auto');
        }
      }).catch(() => {});
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [activeId, token]);

  useEffect(() => {
    if (!shouldScrollOnSendRef.current) return;
    shouldScrollOnSendRef.current = false;
    scrollThreadToBottom('smooth');
  }, [thread]);

  // Close emoji panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pickEmoji = (e) => {
    setText(t => t + e);
    setShowEmoji(false);
  };

  const handleImgChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  };

  const clearImg = () => { setImgFile(null); setImgPreview(''); fileRef.current && (fileRef.current.value = ''); };

  const send = async (e) => {
    e.preventDefault();
    if (!activeId || (sending) || (!text.trim() && !imgFile)) return;
    setSending(true);
    try {
      let imagePath = null;
      if (imgFile) {
        const fd = new FormData();
        fd.append('image', imgFile);
        fd.append('receiver_id', activeId);
        const res = await uploadFile('/messages/image', fd, token);
        imagePath = res.image_path;
        setThread(t => [...t, { ...res.message, sender_name: user?.name }]);
      }
      if (text.trim()) {
        const msg = await api.post('/messages', { receiver_id: activeId, content: text.trim() }, token);
        setThread(t => [...t, { ...msg, sender_name: user?.name }]);
      }
      setText('');
      clearImg();
      shouldScrollOnSendRef.current = true;
    } catch {/* ignore */}
    setSending(false);
  };

  const activeContact = contacts.find(c => c.id === activeId);
  const unreadMap = Object.fromEntries(inbox.map(m => [m.sender_id, true]));
  const contactsWithMsg = contacts
    .filter(c => inboxDataRef.current[c.id])
    .sort((a, b) => new Date(inboxDataRef.current[b.id]?.created_at || 0) - new Date(inboxDataRef.current[a.id]?.created_at || 0));
  const contactsNoMsg = contacts.filter(c => !inboxDataRef.current[c.id]);

  return (
    <>
    <div className="msg-page wa-chat-shell msg-page--fullscreen">
      <div className={`msg-sidebar ${mobilePanel === 'chat' ? 'msg-sidebar-hidden' : ''}`}>
        <div className="msg-sidebar-header">
          <button type="button" className="msg-wa-back" onClick={() => navigate(-1)} aria-label="Back">←</button>
          <span className="msg-sidebar-title">Chats</span>
        </div>
        {contacts.length === 0 && <div className="msg-empty">No contacts yet. Join a class first.</div>}

        {contactsWithMsg.length > 0 && <div className="msg-section-label">💬 Messages</div>}
        {contactsWithMsg.map(c => {
          const msgData = inboxDataRef.current[c.id];
          const isUnread = !!unreadMap[c.id];
          return (
            <div
              key={c.id}
              className={`msg-contact ${activeId === c.id ? 'active' : ''}${isUnread ? ' unread' : ''}`}
              onClick={() => openChat(c.id)}
            >
              <div className="msg-contact-avatar-wrap">
                <img src={c.avatar_path ? `${UPLOADS_BASE}${c.avatar_path}` : DEFAULT_AVATAR} alt="" className="msg-contact-avatar" />
                {isUnread && <span className="msg-unread-dot" />}
              </div>
              <div className="msg-contact-info">
                <span
                  className="msg-contact-name"
                  onClick={(e) => { e.stopPropagation(); setProfilePerson(c); }}
                  style={{ cursor: 'pointer' }}
                >
                  {c.name}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: 3, verticalAlign: 'middle' }}>
                    <circle cx="12" cy="12" r="12" fill="#1d9bf0"/>
                    <path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                {msgData?.content && (
                  <span className="msg-preview">{msgData.content.length > 38 ? msgData.content.slice(0, 38) + '…' : msgData.content}</span>
                )}
              </div>
            </div>
          );
        })}

        {contactsNoMsg.length > 0 && <div className="msg-section-label">👥 Classmates</div>}
        {contactsNoMsg.map(c => (
          <div
            key={c.id}
            className={`msg-contact ${activeId === c.id ? 'active' : ''}`}
            onClick={() => openChat(c.id)}
          >
            <div className="msg-contact-avatar-wrap">
              <img src={c.avatar_path ? `${UPLOADS_BASE}${c.avatar_path}` : DEFAULT_AVATAR} alt="" className="msg-contact-avatar" />
            </div>
            <div className="msg-contact-info">
              <span
                className="msg-contact-name"
                onClick={(e) => { e.stopPropagation(); setProfilePerson(c); }}
                style={{ cursor: 'pointer' }}
              >
                {c.name}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: 3, verticalAlign: 'middle' }}>
                  <circle cx="12" cy="12" r="12" fill="#1d9bf0"/>
                  <path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span className="msg-contact-role">{c.role}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={`msg-chat ${mobilePanel === 'list' ? 'msg-chat-hidden' : ''}`}>
        {!activeId ? (
          <div className="msg-no-chat">
            <div className="msg-no-chat-icon">💬</div>
            <p>Select a contact to start chatting</p>
          </div>
        ) : (
          <>
            <div className="msg-chat-header">
              <button className="msg-back-btn" onClick={() => setMobilePanel('list')}>←</button>
              <img
                src={activeContact?.avatar_path ? `${UPLOADS_BASE}${activeContact.avatar_path}` : DEFAULT_AVATAR}
                alt=""
                className="msg-chat-avatar"
              />
              <div>
                <div className="msg-chat-name">
                  {activeContact?.name}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: 4, verticalAlign: 'middle' }}>
                    <circle cx="12" cy="12" r="12" fill="#1d9bf0"/>
                    <path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="msg-chat-role">{activeContact?.role}</div>
              </div>
            </div>

            <div className="wa-chat-body">
              <div className="msg-thread" ref={threadRef}>
                {thread.length === 0 && <div className="msg-empty msg-thread-empty">Start the conversation!</div>}
                {thread.map(m => (
                  <div key={m.id} className={`msg-bubble-wrap ${m.sender_id === user?.id ? 'mine' : 'theirs'}`}>
                    <div className={`msg-bubble ${m.message_type && m.message_type !== 'chat' ? 'msg-bubble-announce' : ''}`}>
                      {m.message_type && m.message_type !== 'chat' && (
                        <span className="msg-type-tag">{m.message_type.replace(/_/g, ' ')}</span>
                      )}
                      {m.image_path && (
                        <img
                          src={`${UPLOADS_BASE}${m.image_path}`}
                          alt="shared"
                          className="msg-img"
                          onClick={() => window.open(`${UPLOADS_BASE}${m.image_path}`, '_blank')}
                        />
                      )}
                      {m.content && <p>{m.content}</p>}
                      <span className="msg-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {imgPreview && (
                <div className="msg-img-preview">
                  <img src={imgPreview} alt="preview" />
                  <button className="msg-img-clear" onClick={clearImg}>✕</button>
                </div>
              )}
            </div>

            <form className="msg-input-row" onSubmit={send}>
              <div className="msg-attach-wrap">
                <button
                  type="button"
                  className="msg-icon-btn"
                  title="Attach"
                  onClick={() => setShowAttachMenu((s) => !s)}
                >+</button>
                {showAttachMenu && (
                  <div className="msg-attach-menu">
                    <button type="button" onClick={() => { fileRef.current?.click(); setShowAttachMenu(false); }}>
                      🖼 Image
                    </button>
                    {user?.role === 'student' && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachMenu(false);
                          setShowShareComposition(true);
                        }}
                      >
                        📄 Share composition to…
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="msg-emoji-wrap" ref={emojiRef}>
                <button type="button" className="msg-icon-btn" onClick={() => setShowEmoji(s => !s)} title="Emoji">😊</button>
                {showEmoji && (
                  <div className="emoji-panel">
                    {EMOJI_LIST.map(e => (
                      <button key={e} type="button" className="emoji-btn" onClick={() => pickEmoji(e)}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImgChange} />
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Type a message..."
                disabled={sending}
                enterKeyHint="send"
                inputMode="text"
              />
              <button type="submit" className="msg-send-btn" disabled={sending || (!text.trim() && !imgFile)}>
                ➤
              </button>
            </form>
          </>
        )}
      </div>
    </div>
    {showShareComposition && activeId && (
      <ShareCompositionModal
        token={token}
        receiverId={activeId}
        receiverName={activeContact?.name}
        onClose={() => setShowShareComposition(false)}
        onSent={() => {
          shouldScrollOnSendRef.current = true;
          api.get(`/messages/thread/${activeId}`, token).then(setThread).catch(() => {});
        }}
      />
    )}
    {profilePerson && (
      <ClassmateProfileModal
        person={profilePerson}
        onClose={() => setProfilePerson(null)}
        onMessage={(uid) => { setProfilePerson(null); setActiveId(uid); setMobilePanel('chat'); }}
      />
    )}
    </>
  );
}
