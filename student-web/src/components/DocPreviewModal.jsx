import { useEffect, useRef, useState } from 'react';

// PDF.js canvas renderer — renders each page as a <canvas>, no external viewer
function PdfCanvasViewer({ fileUrl, onReady, badgeColor }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const version = pdfjsLib.version || '5.6.205';
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

        const pdf = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) return;
        onReady && onReady();

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: window.devicePixelRatio > 1 ? 1.5 : 1.2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '8px';
          canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          canvas.style.background = '#fff';
          container.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError('Could not load PDF.');
        onReady && onReady();
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  if (error) return <div style={{ padding: 24, color: '#ef4444', fontWeight: 600 }}>{error}</div>;

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#e2e8f0', padding: '12px 8px', overscrollBehavior: 'contain' }}
    />
  );
}

const EXT_COLORS = {
  PDF:  '#ef4444',
  DOCX: '#2563eb', DOC: '#2563eb',
  PPTX: '#ea580c', PPT: '#ea580c',
  XLSX: '#16a34a', XLS: '#16a34a',
  TXT:  '#64748b',
  JPG:  '#8b5cf6', JPEG: '#8b5cf6', PNG: '#8b5cf6', GIF: '#8b5cf6', WEBP: '#8b5cf6',
};

function getFileType(ext) {
  const e = ext.toUpperCase();
  if (['JPG','JPEG','PNG','GIF','WEBP','BMP','SVG'].includes(e)) return 'image';
  if (e === 'PDF') return 'pdf';
  if (e === 'TXT') return 'text';
  if (['DOC','DOCX','PPT','PPTX','XLS','XLSX'].includes(e)) return 'office';
  return 'other';
}

export default function DocPreviewModal({ fileUrl, fileName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState('');
  const isNarrow = typeof window !== 'undefined' && window.innerWidth <= 760;
  const displayName = fileName ? fileName.replace(/^\d+-\d+\./, '') : 'Document';
  const rawExt = displayName.includes('.') ? displayName.split('.').pop() : '';
  const ext = rawExt.toUpperCase();
  const fileType = getFileType(rawExt);
  const badgeColor = EXT_COLORS[ext] || '#667eea';

  // Strip query params for Office Online viewer (needs clean URL)
  const cleanFileUrl = fileUrl.split('?')[0];
  // Mobile uses Google Docs Viewer for better readability on small screens.
  const officeUrl = isNarrow
    ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(cleanFileUrl)}`
    : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(cleanFileUrl)}`;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep preview stable by locking background page scroll while modal is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Fetch text files
  useEffect(() => {
    if (fileType === 'text') {
      fetch(fileUrl)
        .then(r => r.text())
        .then(t => { setTextContent(t); setLoading(false); })
        .catch(() => { setTextContent('Could not load file.'); setLoading(false); });
    }
  }, [fileUrl, fileType]);

  const renderContent = () => {
    if (fileType === 'image') {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', overflow: 'auto', overflowX: 'hidden', padding: 16, overscrollBehavior: 'contain' }}>
          <img
            src={fileUrl}
            alt={displayName}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        </div>
      );
    }

    if (fileType === 'pdf') {
      return (
        <PdfCanvasViewer
          fileUrl={fileUrl}
          badgeColor={badgeColor}
          onReady={() => setLoading(false)}
        />
      );
    }

    if (fileType === 'text') {
      return (
        <pre style={{
          flex: 1, overflow: 'auto', padding: 24, margin: 0,
          background: '#0f172a', color: '#e2e8f0', fontSize: 14,
          lineHeight: 1.7, fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap',
          overflowX: 'hidden', overscrollBehavior: 'contain',
        }}>
          {textContent}
        </pre>
      );
    }

    if (fileType === 'office') {
      return (
        <iframe
          src={officeUrl}
          style={{ flex: 1, border: 'none', background: '#fff', width: '100%', minWidth: 0, minHeight: 0 }}
          title={displayName}
          allowFullScreen
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      );
    }

    // Fallback for unknown types
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 15 }}>
        Preview not available for this file type.
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflowX: 'hidden', overscrollBehavior: 'contain', height: '100dvh' }}>
      {/* Header */}
      <div style={{
        background: '#1e293b', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, gap: 10, minWidth: 0, flexWrap: isNarrow ? 'wrap' : 'nowrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', minWidth: 0, flex: '1 1 auto' }}>
          <span style={{
            background: badgeColor, color: '#fff', fontWeight: 700,
            fontSize: 11, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
          }}>{ext || 'FILE'}</span>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, minWidth: 0, flexWrap: 'wrap', width: isNarrow ? '100%' : 'auto' }}>
          <a href={fileUrl} download={displayName} style={{
            padding: '6px 14px', background: '#334155', color: '#fff',
            borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            textAlign: 'center', whiteSpace: 'nowrap', flex: isNarrow ? 1 : 'none',
          }}>⬇ Download</a>
          <a href={fileUrl} target="_blank" rel="noreferrer" style={{
            padding: '6px 14px', background: '#334155', color: '#fff',
            borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            textAlign: 'center', whiteSpace: 'nowrap', flex: isNarrow ? 1 : 'none',
          }}>↗ New tab</a>
          <button onClick={onClose} style={{
            background: '#ef4444', color: '#fff', border: 'none',
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            whiteSpace: 'nowrap', flex: isNarrow ? 1 : 'none',
          }}>✕ Close</button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: '49px 0 0 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', zIndex: 2,
        }}>
          <div style={{
            width: 48, height: 48, border: '5px solid #e2e8f0',
            borderTopColor: badgeColor, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ marginTop: 16, color: '#64748b', fontWeight: 600 }}>Loading {displayName}…</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            {fileType === 'office' ? 'Connecting to document viewer…' : ''}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {renderContent()}
    </div>
  );
}
