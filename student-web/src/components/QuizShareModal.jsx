import { useState } from 'react';
import ShareModal from './ShareModal';

export default function QuizShareModal({ quizTitle, className, shareUrl, onClose }) {
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState(shareUrl || '');
  const [error, setError] = useState('');

  const text = [
    quizTitle ? `Take quiz: ${quizTitle}` : 'Take this UClass quiz',
    className ? `Class: ${className}` : '',
    'Open the link to sign up as Guest, Student, or Teacher and try the quiz.',
  ]
    .filter(Boolean)
    .join('\n');

  if (!url) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '100%',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ margin: '0 0 12px', color: '#64748b' }}>Create a share link first.</p>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="button" className="btn btn-secondary btn-full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <ShareModal
      title={quizTitle ? `Share: ${quizTitle}` : 'Share quiz'}
      text={text}
      url={url}
      onClose={onClose}
    />
  );
}

export function useQuizShareLink(classId, quizId, token, api) {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createLink = async () => {
    if (!token || !classId || !quizId) return null;
    setLoading(true);
    setError('');
    try {
      const data = await api.post(
        `/classes/${classId}/quizzes/${quizId}/share`,
        { channel: 'social' },
        token
      );
      const url = data.share_url || data.app_url;
      setShareUrl(url);
      return url;
    } catch (e) {
      setError(e.message || 'Could not create share link.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { shareUrl, loading, error, createLink, setShareUrl };
}
