import { useEffect, useState } from 'react';
import { WritingCertificateDocument } from './AdminWritingCertificate';
import { downloadCertificatePdf, downloadCertificatePng } from '../../utils/certificateDownload';
import './WritingCertificate.css';

export default function CertificateReviewModal({
  open,
  onClose,
  certificateProps,
  studentName,
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const name = (studentName || '').trim();
  const canAct = name.length > 0;

  const runDownload = async (kind) => {
    if (!canAct) return;
    setBusy(kind);
    setError('');
    try {
      if (kind === 'png') await downloadCertificatePng(name);
      else await downloadCertificatePdf(name);
    } catch (e) {
      setError(e.message || 'Download failed.');
    } finally {
      setBusy('');
    }
  };

  const handlePrint = () => {
    if (!canAct) return;
    window.print();
  };

  return (
    <div
      className="wcert-review-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wcert-review-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="wcert-review-panel">
        <header className="wcert-review-header">
          <div>
            <h2 id="wcert-review-title">Review certificate</h2>
            <p className="wcert-review-sub">
              Admin only — check layout, then download or print for{' '}
              <strong>{name || '…'}</strong>
            </p>
          </div>
          <button type="button" className="wcert-review-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {error && <p className="wcert-review-error">{error}</p>}

        <div className="wcert-review-toolbar">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canAct || Boolean(busy)}
            onClick={() => runDownload('pdf')}
          >
            {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canAct || Boolean(busy)}
            onClick={() => runDownload('png')}
          >
            {busy === 'png' ? 'Preparing PNG…' : 'Download PNG'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!canAct}
            onClick={handlePrint}
          >
            Print
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Back to editor
          </button>
        </div>

        <div className="wcert-review-scroll">
          <WritingCertificateDocument {...certificateProps} />
        </div>
      </div>
    </div>
  );
}
