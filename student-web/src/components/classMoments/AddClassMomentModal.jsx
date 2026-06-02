import { useState } from 'react';
import { uploadFile } from '../../api';
import { prepareMomentImageFiles } from '../../utils/compressImage';

export default function AddClassMomentModal({ token, classes, onClose, onPublished }) {
  const [classId, setClassId] = useState(classes[0]?.id ? String(classes[0].id) : '');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('');
  const [error, setError] = useState('');

  const onPickFiles = async (e) => {
    const picked = Array.from(e.target.files || []).slice(0, 10);
    if (!picked.length) return;
    e.target.value = '';
    setError('');
    setPreparing(true);
    try {
      const merged = [...files, ...picked].slice(0, 10);
      const optimized = await prepareMomentImageFiles(merged);
      previews.forEach((u) => URL.revokeObjectURL(u));
      setFiles(optimized);
      setPreviews(optimized.map((f) => URL.createObjectURL(f)));
    } catch (err) {
      setError(err.message || 'Could not prepare photos.');
    } finally {
      setPreparing(false);
    }
  };

  const removeAt = (i) => {
    URL.revokeObjectURL(previews[i]);
    setFiles((prev) => prev.filter((_, j) => j !== i));
    setPreviews((prev) => prev.filter((_, j) => j !== i));
  };

  const publish = async (e) => {
    e.preventDefault();
    if (!classId) {
      setError('Select a class.');
      return;
    }
    if (!files.length) {
      setError('Add at least one photo.');
      return;
    }
    setLoading(true);
    setUploadPhase('Uploading…');
    setError('');
    try {
      const fd = new FormData();
      fd.append('class_id', classId);
      fd.append('description', description.trim());
      files.forEach((f) => fd.append('photos', f));
      const data = await uploadFile('/class-moments', fd, token);
      onPublished?.(data.moment);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setUploadPhase('');
    }
  };

  const busy = loading || preparing;

  return (
    <div className="cm-modal-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={(ev) => ev.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem' }}>Add Class Moment</h2>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          Photos are optimized automatically for a faster upload.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {preparing && (
          <p className="cm-upload-status" role="status">
            Optimizing photos…
          </p>
        )}
        <form onSubmit={publish}>
          <label className="form-group">
            Class
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
              disabled={busy}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10 }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-group">
            Photos (1–10)
            <input type="file" accept="image/*" multiple onChange={onPickFiles} disabled={busy} />
          </label>
          {previews.length > 0 && (
            <div className="cm-photo-grid">
              {previews.map((src, i) => (
                <div key={src} className="cm-photo-thumb">
                  <img src={src} alt="" />
                  <button type="button" className="cm-photo-remove" onClick={() => removeAt(i)} disabled={busy}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="form-group">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Today learners practiced reading comprehension…"
              rows={4}
              required
              minLength={3}
              disabled={busy}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
              {loading ? uploadPhase || 'Publishing…' : 'Publish now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
