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

  const handleReactions = (reactions) => {
    onReactionsChange?.(moment.id, reactions);
  };

  return (
    <article
      className={`cm-wa-row${moment._pending ? ' cm-wa-row--pending' : ''}`}
      style={style}
    >
      <img
        className="cm-wa-avatar"
        src={teacherAvatarUrl(moment.teacher_avatar_path)}
        alt=""
      />
      <div className="cm-wa-col">
        <div className="cm-wa-bubble">
          {moment._pending && (
            <span className="cm-wa-pending-chip" role="status">
              Uploading…
            </span>
          )}
          <header className="cm-wa-bubble-head">
            <span className="cm-wa-name">{moment.teacher_name}</span>
            <span className="cm-wa-meta">
              {moment.class_name} · {formatMomentWhen(moment.published_at)}
            </span>
          </header>

          {current && (
            <div
              className="cm-wa-media"
              onClick={() => images.length > 1 && setIdx((i) => (i + 1) % images.length)}
              role={images.length > 1 ? 'button' : undefined}
              tabIndex={images.length > 1 ? 0 : undefined}
            >
              {isVideo ? (
                <video
                  src={src}
                  controls
                  playsInline
                  preload="metadata"
                  className="cm-wa-video"
                />
              ) : (
                <img src={src} alt="" loading="lazy" />
              )}
              {images.length > 1 && (
                <div className="cm-wa-dots">
                  {images.map((_, i) => (
                    <span key={i} className={i === idx ? 'active' : ''} />
                  ))}
                </div>
              )}
            </div>
          )}

          {moment.description ? (
            <p className="cm-wa-caption">{moment.description}</p>
          ) : null}
        </div>

        {canReact && (
          <ClassMomentReactions
            moment={moment}
            token={token}
            onReactionsChange={handleReactions}
          />
        )}
      </div>
    </article>
  );
}
