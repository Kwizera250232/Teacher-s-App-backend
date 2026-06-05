import { UPLOADS_BASE } from '../../api';

export function inyandikoFileUrl(filePath) {
  if (!filePath) return '';
  const clean = String(filePath).replace(/^\/+/, '');
  return `${UPLOADS_BASE}/uploads/${clean}`;
}

export function isInyandikoPdf(name = '') {
  return /\.pdf$/i.test(name);
}

export function isInyandikoImage(name = '') {
  return /\.(png|jpe?g|webp|gif)$/i.test(name);
}

export function InyandikoDocViewer({ doc, compact = false }) {
  if (!doc) {
    return <p className="iny-empty">{compact ? '—' : 'No document uploaded yet.'}</p>;
  }
  const url = inyandikoFileUrl(doc.file_path);
  const label = doc.title || doc.file_name || 'Document';

  if (isInyandikoPdf(doc.file_name || doc.file_path)) {
    return (
      <div className="iny-doc-view">
        <iframe title={label} src={url} className={compact ? 'iny-doc-frame iny-doc-frame--compact' : 'iny-doc-frame'} />
        <a href={url} target="_blank" rel="noreferrer" className="iny-doc-link">Open full screen ↗</a>
      </div>
    );
  }
  if (isInyandikoImage(doc.file_name || doc.file_path)) {
    return (
      <div className="iny-doc-view">
        <img src={url} alt={label} className={compact ? 'iny-doc-image iny-doc-image--compact' : 'iny-doc-image'} />
        <a href={url} target="_blank" rel="noreferrer" className="iny-doc-link">Open full size ↗</a>
      </div>
    );
  }
  return (
    <div className="iny-doc-view">
      <p className="iny-doc-filename">{label}</p>
      <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary iny-download-btn">
        Download & read ↗
      </a>
    </div>
  );
}
