import { useState } from 'react';
import {
  momentImageUrl,
  teacherAvatarUrl,
  formatMomentWhen,
  isMomentVideo,
} from '../../utils/momentImages';

export default function ClassMomentCard({ moment, style }) {
  const images = Array.isArray(moment.images) ? moment.images : [];
  const [idx, setIdx] = useState(0);
  const current = images[idx];
  const src = current ? momentImageUrl(current.file_path) : '';
  const isVideo = current && isMomentVideo(current.file_path);

  return (
    <article className={`cm-card${moment._pending ? ' cm-card--pending' : ''}`} style={style}>
      {moment._pending && (
        <p className="cm-pending-badge" role="status">
          Publishing…
        </p>
      )}
      <header className="cm-card-header">
        <img
          className="cm-avatar"
          src={teacherAvatarUrl(moment.teacher_avatar_path)}
          alt=""
        />
        <div className="cm-meta">
          <p className="cm-teacher">{moment.teacher_name}</p>
          <p className="cm-sub">
            {moment.class_name} · {formatMomentWhen(moment.published_at)}
          </p>
        </div>
      </header>
      {current && (
        <div
          className="cm-gallery"
          onClick={() => images.length > 1 && setIdx((i) => (i + 1) % images.length)}
          role={images.length > 1 ? 'button' : undefined}
          tabIndex={images.length > 1 ? 0 : undefined}
        >
          {isVideo ? (
            <video src={src} controls playsInline preload="metadata" className="cm-gallery-video" />
          ) : (
            <img src={src} alt="" loading="lazy" />
          )}
          {images.length > 1 && (
            <div className="cm-gallery-dots">
              {images.map((_, i) => (
                <span key={i} className={i === idx ? 'active' : ''} />
              ))}
            </div>
          )}
        </div>
      )}
      <p className="cm-desc">{moment.description}</p>
    </article>
  );
}
