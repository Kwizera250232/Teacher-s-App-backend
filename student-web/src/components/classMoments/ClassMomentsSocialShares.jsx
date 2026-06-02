import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { momentImageUrl } from '../../utils/momentImages';
import { classMomentDetailPath } from '../../utils/classMomentPaths';

export default function ClassMomentsSocialShares({ token, userRole }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .get('/class-moments/shared-feed', token)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return null;
  if (!items.length) return null;

  return (
    <section className="cm-shared-section" aria-label="Shared to social media">
      <h3 className="cm-shared-head">📤 Shared to social media</h3>
      <p className="cm-shared-sub">When someone shares a class moment outside the app, it appears here with photo and intro.</p>
      <div className="cm-shared-cards">
        {items.map((row) => {
          const img = Array.isArray(row.images) && row.images[0];
          const src = img ? momentImageUrl(img.file_path) : '';
          return (
            <button
              key={row.share_id}
              type="button"
              className="cm-shared-card"
              onClick={() => navigate(classMomentDetailPath(userRole, row.moment_id))}
            >
              {src && (
                <div className="cm-shared-card-img">
                  <img src={src} alt="" loading="lazy" />
                </div>
              )}
              <div className="cm-shared-card-body">
                <span className="cm-shared-by">
                  {row.sharer_name} shared · {row.class_name}
                </span>
                <p className="cm-shared-caption">
                  {String(row.description || '').slice(0, 120)}
                  {String(row.description || '').length > 120 ? '…' : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
