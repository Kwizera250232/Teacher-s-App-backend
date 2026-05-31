import { useState, useEffect, useRef } from 'react';
import { api, uploadFile } from '../api';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { prepareFeedImageFile } from '../utils/compressImage';
import { useAuth } from '../context/AuthContext';
import Whiteboard from './Whiteboard';
import './ClassroomFeed.css';

const POST_TYPES_TEACHER = [
  { key: 'activity', label: 'Daily activity', icon: '📋' },
  { key: 'exercise', label: 'Exercise', icon: '✏️' },
  { key: 'text', label: 'Text', icon: '💬' },
  { key: 'image', label: 'Photo', icon: '📷' },
  { key: 'document', label: 'Document', icon: '📄' },
  { key: 'voice', label: 'Voice lesson', icon: '🎙️' },
];

const POST_TYPES_STUDENT = [
  { key: 'drawing', label: 'Drawing', icon: '🎨' },
  { key: 'image', label: 'Photo', icon: '📷' },
  { key: 'voice', label: 'Voice note', icon: '🎙️' },
  { key: 'text', label: 'Text', icon: '💬' },
];

function mediaUrl(path) {
  return resolveMediaUrl(path);
}

function inferPostTypeFromFile(file, current) {
  if (!file) return current;
  if (current === 'drawing') return 'drawing';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'voice';
  return current;
}

const TEXT_PREVIEW_LENGTH = 120;

function FeedBodyPreview({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > TEXT_PREVIEW_LENGTH;
  if (!isLong || expanded) {
    return (
      <p className="feed-body">
        {text}
        {isLong && <button type="button" className="feed-read-toggle" onClick={() => setExpanded(false)}>Show less</button>}
      </p>
    );
  }
  const firstLine = text.split('\n')[0];
  const preview = firstLine.length > TEXT_PREVIEW_LENGTH ? firstLine.slice(0, TEXT_PREVIEW_LENGTH) + '…' : firstLine;
  return (
    <p className="feed-body feed-body-preview">
      {preview}
      <button type="button" className="feed-read-toggle" onClick={() => setExpanded(true)}>Read more</button>
    </p>
  );
}

export default function ClassroomFeed({ classId, token, readOnly = false }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [postType, setPostType] = useState('text');
  const [body, setBody] = useState('');
  const [classworkSummary, setClassworkSummary] = useState('');
  const [file, setFile] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [posting, setPosting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const audioRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const isStaff = user?.role === 'teacher' || user?.role === 'head_teacher';
  const canPost = !readOnly && (isStaff || user?.role === 'student');
  const typeOptions = isStaff ? POST_TYPES_TEACHER : POST_TYPES_STUDENT;

  const load = () => {
    setLoading(true);
    api.get(`/classroom-feed/${classId}/posts`, token)
      .then(setPosts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [classId]);

  const onPickFile = async (picked) => {
    if (!picked) return;
    setError('');
    setPosting(true);
    try {
      const prepared = /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(picked.name || '') || picked.type?.startsWith('image/')
        ? await prepareFeedImageFile(picked)
        : picked;
      setFile(prepared);
      setPostType((t) => inferPostTypeFromFile(prepared, t));
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  };

  const submitPost = async (extraFile = null) => {
    setError('');
    let upload = extraFile || file;
    if (upload && (upload.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(upload.name || ''))) {
      try {
        upload = await prepareFeedImageFile(upload);
        if (!extraFile) setPostType('image');
      } catch (e) {
        setError(e.message);
        return;
      }
    }
    let type = extraFile ? (postType === 'drawing' ? 'drawing' : inferPostTypeFromFile(upload, postType)) : inferPostTypeFromFile(upload, postType);
    if (['image', 'drawing', 'voice'].includes(type) && !upload) {
      setError(type === 'image' ? 'Choose a photo first (📷 Choose photo).' : 'Attach a file first.');
      return;
    }
    if (type === 'text' && !body.trim() && !upload) {
      setError('Write something or attach a photo.');
      return;
    }
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append('post_type', type);
      if (body.trim()) fd.append('body', body.trim());
      if (classworkSummary.trim()) fd.append('classwork_summary', classworkSummary.trim());
      if (upload) fd.append('file', upload);
      await uploadFile(`/classroom-feed/${classId}/posts`, fd, token);
      setBody('');
      setClassworkSummary('');
      setFile(null);
      setShowBoard(false);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  };

  const onDrawingSave = (blob) => {
    const f = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' });
    setPostType('drawing');
    setFile(f);
    submitPost(f);
  };

  const toggleLike = async (postId) => {
    try {
      await api.post(`/classroom-feed/${classId}/posts/${postId}/like`, {}, token);
      load();
    } catch (e) { setError(e.message); }
  };

  const loadComments = async (postId) => {
    const res = await api.get(`/classroom-feed/${classId}/posts/${postId}/comments`, token);
    setComments((c) => ({ ...c, [postId]: res }));
    setExpandedComments((e) => ({ ...e, [postId]: true }));
  };

  const addComment = async (postId) => {
    const text = (commentText[postId] || '').trim();
    if (!text) return;
    await api.post(`/classroom-feed/${classId}/posts/${postId}/comments`, { body: text }, token);
    setCommentText((c) => ({ ...c, [postId]: '' }));
    loadComments(postId);
    load();
  };

  const deletePost = async (postId) => {
    if (!confirm('Delete this post?')) return;
    try {
      await api.delete(`/classroom-feed/${classId}/posts/${postId}`, token);
      load();
    } catch (e) { setError(e.message); }
  };

  const saveEdit = async (postId) => {
    try {
      await api.patch(`/classroom-feed/${classId}/posts/${postId}`, { body: editBody }, token);
      setEditId(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const repost = (post) => {
    const key = `my_reposts_${user?.id}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    if (existing.some(r => r.id === post.id)) {
      alert('You already saved this to your reposts.');
      return;
    }
    existing.unshift({
      id: post.id,
      class_id: classId,
      author_name: post.author_name,
      author_role: post.author_role,
      post_type: post.post_type,
      body: post.body,
      classwork_summary: post.classwork_summary,
      media_url: post.media_url,
      created_at: post.created_at,
      reposted_at: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(existing));
    alert('Saved to your Profile under "My Reposts / Classworks"!');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const voiceFile = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        setPostType('voice');
        stream.getTracks().forEach((t) => t.stop());
        await submitPost(voiceFile);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError('Microphone access is required for voice posts.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="classroom-feed">
      {error && <div className="alert alert-error">{error}</div>}

      {canPost && (
        <div className="feed-composer">
          <div className="feed-type-row">
            {typeOptions.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`feed-type-btn ${postType === t.key ? 'active' : ''}`}
                onClick={() => setPostType(t.key)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <textarea
            className="feed-textarea"
            placeholder={isStaff ? 'Share class activity, exercise, or lesson notes...' : 'Share your class work here. Feel free to express what you learnt.'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
          />
          {isStaff && (
            <input
              className="feed-input"
              placeholder="Classwork summary (optional)"
              value={classworkSummary}
              onChange={(e) => setClassworkSummary(e.target.value)}
            />
          )}
          {postType === 'image' && (
            <div className="feed-photo-row">
              <label className="btn btn-primary btn-sm">
                📷 Choose photo
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                />
              </label>
              {file && <span className="feed-file-name">✓ {file.name}</span>}
            </div>
          )}
          <div className="feed-composer-actions">
            <label className="btn btn-secondary btn-sm">
              📎 Attach
              <input
                type="file"
                hidden
                accept="image/*,.pdf,.doc,.docx,.webm,.mp3,audio/*"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
              />
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowBoard(!showBoard)}>
              🖊️ Whiteboard
            </button>
            {postType === 'voice' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={recording ? stopRecording : startRecording}>
                {recording ? '⏹ Stop' : '🎙️ Record'}
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" disabled={posting} onClick={() => submitPost()}>
              {posting ? 'Posting...' : 'Post to feed'}
            </button>
          </div>
          {showBoard && <Whiteboard onSave={onDrawingSave} onCancel={() => setShowBoard(false)} />}
        </div>
      )}

      {readOnly && (
        <p className="feed-readonly-hint">You see only your child&apos;s work and teacher posts from this class.</p>
      )}

      {loading ? <p>Loading feed...</p> : posts.length === 0 ? (
        <p className="feed-empty">No posts yet. Be the first to share!</p>
      ) : (
        <div className="feed-list">
          {posts.map((p) => (
            <article key={p.id} className="feed-card">
              <header className="feed-card-head">
                <strong>{p.author_name}</strong>
                <span className="feed-meta">{p.author_role} · {p.post_type} · {new Date(p.created_at).toLocaleString()}</span>
              </header>
              {p.classwork_summary && <p className="feed-summary"><strong>Classwork:</strong> {p.classwork_summary}</p>}
              {editId === p.id ? (
                <div>
                  <textarea className="feed-textarea" value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEdit(p.id)}>Save</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                </div>
              ) : (
                <FeedBodyPreview text={p.body} />
              )}
              {p.author_id === user?.id && editId !== p.id && (
                <div className="feed-own-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditId(p.id); setEditBody(p.body || ''); }}>Edit</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => deletePost(p.id)}>Delete</button>
                </div>
              )}
              {p.media_url && /\.(png|jpe?g|webp|gif)$/i.test(p.media_url) && (
                <img src={mediaUrl(p.media_url)} alt="" className="feed-media-img" />
              )}
              {p.media_url && /\.(webm|mp3|wav|m4a|ogg)$/i.test(p.media_url) && (
                <audio controls src={mediaUrl(p.media_url)} className="feed-audio" />
              )}
              {p.media_url && /\.(pdf|doc|docx|ppt|pptx|txt)$/i.test(p.media_url) && (
                <a href={mediaUrl(p.media_url)} target="_blank" rel="noreferrer" className="feed-doc-link">📄 Open document</a>
              )}
              <footer className="feed-card-foot">
                {!readOnly && user?.role !== 'parent' && (
                  <button type="button" className="feed-action" onClick={() => toggleLike(p.id)}>
                    {p.liked_by_me ? '❤️' : '🤍'} {p.like_count || 0}
                  </button>
                )}
                {readOnly && <span>❤️ {p.like_count || 0}</span>}
                <button type="button" className="feed-action" onClick={() => loadComments(p.id)}>
                  💬 {p.comment_count || 0}
                </button>
                {canPost && user?.role === 'student' && (
                  <button type="button" className="feed-action" onClick={() => repost(p)}>📌 Save</button>
                )}
              </footer>
              {expandedComments[p.id] && (
                <div className="feed-comments">
                  {(comments[p.id] || []).map((c) => (
                    <div key={c.id} className="feed-comment">
                      <strong>{c.author_name}</strong>: {c.body}
                    </div>
                  ))}
                  {!readOnly && user?.role !== 'parent' && (
                    <div className="feed-comment-form">
                      <input
                        value={commentText[p.id] || ''}
                        onChange={(e) => setCommentText((t) => ({ ...t, [p.id]: e.target.value }))}
                        placeholder="Write a comment..."
                      />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => addComment(p.id)}>Reply</button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
