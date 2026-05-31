import { useState, useEffect } from 'react';
import { copyToClipboard } from '../utils/copyToClipboard';
import { createParentInviteLink, formatParentInviteCode } from '../utils/parentInviteApi';
import { MODAL_CARD_STYLE, MODAL_OVERLAY_STYLE } from '../utils/modalOverlay';
import ShareModal from './ShareModal';

export default function ParentInviteModal({ token, studentId, selfStudentId, studentName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await createParentInviteLink({ token, studentId, selfStudentId });
        if (!cancelled) {
          setInviteLink(data.invite_link || '');
          setInviteToken(data.token || '');
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not create invite link.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, studentId, selfStudentId]);

  const parentCode = formatParentInviteCode(inviteToken);
  const signupHint = inviteLink || (parentCode ? `https://student.umunsi.com/invite?parent_token=…` : '');

  const handleCopy = async () => {
    if (!inviteLink) return;
    const ok = await copyToClipboard(inviteLink);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyCode = async () => {
    const text = `Join UClass as parent of ${studentName}. Open this link to register:\n${inviteLink}`;
    const ok = await copyToClipboard(text);
    setCodeCopied(ok);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  const shareText = `Join UClass as parent of ${studentName}. You will only see ${studentName}'s quizzes, marks, and classroom work.`;

  return (
    <>
      <div
        style={{ ...MODAL_OVERLAY_STYLE, zIndex: 5500 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{ ...MODAL_CARD_STYLE, maxWidth: 440 }}
          className="wa-theme"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#075e54' }}>👪 Parent invitation</h2>
          <p style={{ margin: '0 0 16px', color: '#667781', fontSize: 14, lineHeight: 1.5 }}>
            Every student has a <strong>unique link</strong> for their parent. Same signup form for all parents.
          </p>

          {loading && <p style={{ color: '#667781' }}>Preparing your invite…</p>}
          {error && <p className="alert alert-error">{error}</p>}

          {!loading && !error && inviteLink && (
            <>
              {parentCode && (
                <div
                  style={{
                    background: '#dcf8c6',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: 14,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#075e54', letterSpacing: 1 }}>
                    YOUR PARENT CODE
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, color: '#111b21', margin: '6px 0' }}>
                    {parentCode}
                  </div>
                  <div style={{ fontSize: 12, color: '#54656f' }}>
                    Parents open your link below — same form for every family
                  </div>
                </div>
              )}
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Invitation link for {studentName}&apos;s parent
              </label>
              <input
                readOnly
                value={inviteLink}
                onFocus={(e) => e.target.select()}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 12,
                }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={handleCopy}>
                  {copied ? '✓ Copied link' : 'Copy link'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCopyCode}>
                  {codeCopied ? '✓ Copied all' : 'Copy for WhatsApp'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowShare(true)}>
                  Share
                </button>
                <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
              </div>
            </>
          )}

          {!loading && error && (
            <>
              <p style={{ fontSize: 13, color: '#667781' }}>
                If this keeps failing, ask your teacher for a parent link from the class Students tab.
              </p>
              <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>

      {showShare && inviteLink && (
        <ShareModal
          title={`Parent invite — ${studentName}`}
          text={shareText}
          url={inviteLink}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}
