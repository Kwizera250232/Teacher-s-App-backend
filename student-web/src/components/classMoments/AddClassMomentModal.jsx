import { useState } from 'react';
import { uploadFile } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { prepareMomentMediaFiles } from '../../utils/compressImage';

export default function AddClassMomentModal({
  token,
  classes,
  onClose,
  onPublished,
}) {
  const { user: me } = useAuth();
  const [classId, setClassId] = useState(classes[0]?.id ? String(classes[0].id) : '');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const busy = preparing || uploading;

  const onPickFiles = async (e) => {
    const picked = Array.from(e.target.files || []).slice(0, 10);
    if (!picked.length) return;
    e.target.value = '';
    setError('');
    setPreparing(true);
    try {
      const optimized = await prepareMomentMediaFiles(picked);
      const merged = [...files, ...optimized].slice(0, 10);
      previews.forEach((u) => {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
      setFiles(merged);
      setPreviews(merged.map((f) => URL.createObjectURL(f)));
    } catch (err) {
      setError(err.message || 'Could not prepare files.');
    } finally {
      setPreparing(false);
    }
  };

  const removeAt = (i) => {
    const url = previews[i];
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    setFiles((prev) => prev.filter((_, j) => j !== i));
    setPreviews((prev) => prev.filter((_, j) => j !== i));
  };

  const publish = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!classId) {
      setError('Select a class.');
      return;
    }
    if (!files.length) {
      setError('Add at least one photo or video.');
      return;
    }
    if (description.trim().length < 3) {
      setError('Write a short description (at least 3 characters).');
      return;
    }

    const fd = new FormData();
    fd.append('class_id', classId);
    fd.append('description', description.trim());
    files.forEach((f) => fd.append('photos', f));

    setUploading(true);
    setError('');
    try {
      const data = await uploadFile('/class-moments', fd, token, { timeoutMs: 180000 });
      const moment = data.moment || data;
      if (!moment?.id) {
        throw new Error('Server did not return the new post. Try refreshing the page.');
      }
      previews.forEach((u) => {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
      onPublished?.({
        ...moment,
        teacher_name: moment.teacher_name || me?.name || 'Teacher',
        _pending: false,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not publish. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="cm-modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="cm-modal" onClick={(ev) => ev.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem' }}>Add Class Moment</h2>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          Share photos from today&apos;s lesson — saved when upload finishes.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {preparing && (
          <p className="cm-upload-status" role="status">
            Preparing files…
          </p>
        )}
        {uploading && (
          <p className="cm-upload-status cm-upload-status--active" role="status">
            Uploading to class… Please keep this open.
          </p>
        )}
        <form onSubmit={publish}>
          <label className="form-group">
            Class
            <select
              value={classId}
              onChange={(ev) => setClassId(ev.target.value)}
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
            Photos or videos (1–10)
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={onPickFiles}
              disabled={busy}
            />
          </label>
          {previews.length > 0 && (
            <div className="cm-photo-grid">
              {previews.map((src, i) => (
                <div key={src} className="cm-photo-thumb">
                  {files[i]?.type?.startsWith('video/') ? (
                    <video src={src} muted playsInline className="cm-thumb-video" />
                  ) : (
                    <img src={src} alt="" />
                  )}
                  <button
                    type="button"
                    className="cm-photo-remove"
                    disabled={busy}
                    onClick={() => removeAt(i)}
                  >
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
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="Today learners practiced reading comprehension…"
              rows={4}
              required
              minLength={3}
              disabled={busy}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={uploading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
              {uploading ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
