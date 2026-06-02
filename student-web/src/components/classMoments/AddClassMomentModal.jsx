import { useState } from 'react';
import { uploadFile } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { prepareMomentMediaFiles } from '../../utils/compressImage';

export default function AddClassMomentModal({
  token,
  classes,
  user,
  onClose,
  onPublished,
  onUploadFailed,
}) {
  const { user: authUser } = useAuth();
  const me = user || authUser;
  const [classId, setClassId] = useState(classes[0]?.id ? String(classes[0].id) : '');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');

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

  const publish = (e) => {
    e.preventDefault();
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

    const cls = classes.find((c) => String(c.id) === classId);
    const tempId = `pending-${Date.now()}`;
    const optimistic = {
      id: tempId,
      _pending: true,
      teacher_id: me?.id,
      description: description.trim(),
      class_name: cls?.name || 'Class',
      teacher_name: me?.name || 'Teacher',
      published_at: new Date().toISOString(),
      images: previews.map((url, i) => ({
        id: `tmp-${i}`,
        file_path: url,
        sort_order: i,
      })),
    };

    onPublished?.(optimistic, { pendingId: tempId });
    onClose();

    const fd = new FormData();
    fd.append('class_id', classId);
    fd.append('description', description.trim());
    files.forEach((f) => fd.append('photos', f));

    uploadFile('/class-moments', fd, token)
      .then((data) => {
        previews.forEach((u) => {
          if (u.startsWith('blob:')) URL.revokeObjectURL(u);
        });
        onPublished?.(data.moment, { replaceId: tempId });
      })
      .catch((err) => {
        onUploadFailed?.(tempId, err.message || 'Upload failed.');
      });
  };

  return (
    <div className="cm-modal-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={(ev) => ev.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem' }}>Add Class Moment</h2>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
          Posts instantly — photos and videos upload in the background.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {preparing && (
          <p className="cm-upload-status" role="status">
            Preparing files…
          </p>
        )}
        <form onSubmit={publish}>
          <label className="form-group">
            Class
            <select
              value={classId}
              onChange={(ev) => setClassId(ev.target.value)}
              required
              disabled={preparing}
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
              disabled={preparing}
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
                  <button type="button" className="cm-photo-remove" onClick={() => removeAt(i)}>
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
              disabled={preparing}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-full" disabled={preparing}>
              Publish now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
