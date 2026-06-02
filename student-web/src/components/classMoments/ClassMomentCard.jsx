import { useState } from 'react';
import {
  momentImageUrl,
  teacherAvatarUrl,
  formatMomentWhen,
  isMomentVideo,
} from '../../utils/momentImages';
import ClassMomentReactions from './ClassMomentReactions';
import { canReactToMoment } from '../../utils/momentReactions';

export default function ClassMomentCard({
  moment,
  style,
  token,
  onReactionsChange,
  showReactions = true,
}) {
  const images = Array.isArray(moment.images) ? moment.images : [];
  const [idx, setIdx] = useState(0);
  const current = images[idx];
  const src = current ? momentImageUrl(current.file_path) : '';
  const isVideo = current && isMomentVideo(current.file_path);
  const canReact = showReactions && token && canReactToMoment(moment);
  const pending = Boolean(moment._pending);

  const handleReactions = (reactions) => {
    onReactionsChange?.(moment.id, reactions);
  };

  return (
    <article
      className={`cm-soc-post${pending ? ' cm-soc-post--pending' : ''}`}
      style={style}
    >
      <header className="cm-soc-post__head">
        <img
          className="cm-soc-avatar"
          src={teacherAvatarUrl(moment.teacher_avatar_path)}
          alt=""
        />
        <div className="cm-soc-post__meta">
          <strong className="cm-soc-post__name">{moment.teacher_name}</strong>
          <div className="cm-soc-post__sub">
            {moment.class_name ? (
              <span className="cm-soc-pill">{moment.class_name}</span>
            ) : null}
            <time className="cm-soc-time">{formatMomentWhen(moment.published_at)}</time>
          </div>
        </div>
        {pending && (
          <span className="cm-soc-sending" role="status">
            Sending…
          </span>
        )}
      </header>

      {current && (
        <div className="cm-soc-post__media-wrap">
          <div
            className="cm-soc-post__media"
            onClick={() => images.length > 1 && setIdx((i) => (i + 1) % images.length)}
            role={images.length > 1 ? 'button' : undefined}
            tabIndex={images.length > 1 ? 0 : undefined}
            aria-label={images.length > 1 ? 'Next photo' : undefined}
          >
            {isVideo ? (
              <video
                src={src}
                controls
                playsInline
                preload="metadata"
                className="cm-soc-media-el"
              />
            ) : (
              <img src={src} alt="" loading="lazy" decoding="async" className="cm-soc-media-el" />
            )}
            {images.length > 1 && (
              <div className="cm-soc-dots" aria-hidden>
                {images.map((_, i) => (
                  <span key={i} className={i === idx ? 'active' : ''} />
                ))}
              </div>
            )}
            <span className="cm-soc-media-badge" aria-hidden>
              📸 Class moment
            </span>
          </div>
        </div>
      )}

      {moment.description ? (
        <p className="cm-soc-post__caption">{moment.description}</p>
      ) : null}

      {canReact && (
        <footer className="cm-soc-post__footer">
          <ClassMomentReactions
            moment={moment}
            token={token}
            onReactionsChange={handleReactions}
          />
        </footer>
      )}
    </article>
  );
}
