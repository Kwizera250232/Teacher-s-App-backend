import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UPLOADS_BASE } from '../api';
import { momentImageUrl } from '../utils/momentImages';
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

  const firstImg = Array.isArray(data?.images) && data.images[0];
  const imgSrc = firstImg
    ? momentImageUrl(firstImg.file_path)
    : data?.image_url || '';

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
        <span>Photos hosted on {UPLOADS_BASE.replace(/^https?:\/\//, '')}</span>
      </footer>
    </div>
  );
}
