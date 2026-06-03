import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { momentImageUrl } from '../utils/momentImages';
import { publicSiteBase } from '../utils/shareLinks';
import { pickFirstMomentPhoto } from '../utils/momentPreviewImage';
import '../components/classMoments/ClassMoments.css';
import './ShareMomentPage.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ShareMomentPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('Invalid link.');
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/public/moments/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load this moment.');
        setData(body);
      })
      .catch((err) => setError(err.message || 'Could not load this moment.'))
      .finally(() => setLoading(false));
  }, [token]);

  const previewPhoto = pickFirstMomentPhoto(data?.images);
  const sharePreview =
    token && typeof window !== 'undefined'
      ? `${publicSiteBase()}/share/moment/${encodeURIComponent(token)}/preview.jpg`
      : '';
  const imgSrc =
    sharePreview ||
    data?.preview_image_url ||
    data?.image_url ||
    (previewPhoto ? momentImageUrl(previewPhoto.file_path) : '');

  useEffect(() => {
    if (!data) return;
    const title = data.title || `${data.teacher_name || 'Teacher'} · ${data.class_name || 'Class'}`;
    const desc = data.description || 'Class moment on UClass';
    document.title = title;
    const setMeta = (prop, content, isProperty = true) => {
      if (!content) return;
      const attr = isProperty ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${prop}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('og:title', title);
    setMeta('og:description', desc);
    setMeta('og:image', imgSrc);
    setMeta('og:image:secure_url', imgSrc);
    setMeta('twitter:card', 'summary_large_image', false);
    setMeta('twitter:image', imgSrc, false);
  }, [data, imgSrc]);

  return (
    <div className="share-moment-page">
      <header className="share-moment-header">
        <Link to="/welcome" className="share-moment-brand">
          UClass
        </Link>
        <span className="share-moment-tag">Class moment</span>
      </header>

      {loading && <p className="share-moment-muted">Loading…</p>}
      {error && !loading && (
        <div className="share-moment-card share-moment-card--error">
          <p>{error}</p>
          <Link to="/login" className="btn btn-primary btn-sm">
            Sign in to UClass
          </Link>
        </div>
      )}

      {!loading && !error && data && (
        <article className="share-moment-card cm-soc-post">
          <header className="cm-soc-post__head">
            <div className="cm-soc-post__meta">
              <strong className="cm-soc-post__name">{data.title || data.teacher_name}</strong>
              <div className="cm-soc-post__sub">
                {data.class_name && <span className="cm-soc-pill">{data.class_name}</span>}
                {data.sharer_name && (
                  <span className="share-moment-shared-by">Shared by {data.sharer_name}</span>
                )}
              </div>
            </div>
          </header>

          {imgSrc && (
            <div className="cm-soc-post__media-wrap">
              <div className="cm-soc-post__media">
                <img src={imgSrc} alt="" className="cm-soc-media-el" loading="eager" />
              </div>
            </div>
          )}

          {data.description && <p className="cm-soc-post__caption">{data.description}</p>}

          <p className="share-moment-cta-text">
            Open UClass to see reactions, comments from class, and more moments from your school.
          </p>
          <div className="share-moment-actions">
            <Link to="/login" className="btn btn-primary">
              Sign in
            </Link>
            <Link to="/register" className="btn btn-secondary">
              Create account
            </Link>
          </div>
        </article>
      )}

      <footer className="share-moment-footer">
        <span>UClass — student.umunsi.com</span>
      </footer>
    </div>
  );
}
