import { useRef, useState, useCallback } from 'react';
import './TutorialVideo.css';

const DEFAULT_SRC = '/videos/uclass-tutorial.mp4';
const DEFAULT_POSTER = '/images/landing/656642666_1404974461657878_6540421227514327794_n.jpg';

function VideoPlayer({ title, src, poster }) {
  const videoRef = useRef(null);

  const toggleFullscreen = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.());
      }
    } catch {
      /* ignore — controls may still offer fullscreen */
    }
  }, []);

  return (
    <div className="tutorial-video__player-wrap">
      <video
        ref={videoRef}
        className="tutorial-video__player"
        controls
        playsInline
        preload="metadata"
        poster={poster}
        aria-label={title}
      >
        <source src={src} type="video/mp4" />
        Your browser does not support HTML5 video.
      </video>
      <button
        type="button"
        className="tutorial-video__fs-btn"
        onClick={toggleFullscreen}
        aria-label="Fullscreen"
        title="Fullscreen"
      >
        ⛶
      </button>
    </div>
  );
}

/**
 * Embeddable tutorial / how-to video with optional modal fullscreen.
 */
export default function TutorialVideo({
  title = 'How to use UClass',
  subtitle = 'Step-by-step guide — teachers, students, parents & guests',
  src = DEFAULT_SRC,
  poster = DEFAULT_POSTER,
  compact = false,
  wideFull = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [modalFs, setModalFs] = useState(false);

  const player = (
    <VideoPlayer title={title} src={src} poster={poster} />
  );

  if (compact) {
    return (
      <div className={`tutorial-video tutorial-video--compact ${className}`.trim()}>
        <button
          type="button"
          className="tutorial-video__compact-btn"
          onClick={() => setOpen(true)}
          aria-label={`Play ${title}`}
        >
          <span className="tutorial-video__play-icon" aria-hidden="true">▶</span>
          <span>
            <strong>{title}</strong>
            {subtitle && <small>{subtitle}</small>}
          </span>
        </button>
        {open && (
          <div
            className={`tutorial-video__modal${modalFs ? ' tutorial-video__modal--fullscreen' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="tutorial-video__modal-backdrop" onClick={() => { setOpen(false); setModalFs(false); }} />
            <div className="tutorial-video__modal-body">
              <div className="tutorial-video__modal-toolbar">
                <button
                  type="button"
                  className="tutorial-video__toolbar-btn"
                  onClick={() => setModalFs((v) => !v)}
                  aria-label={modalFs ? 'Exit expanded view' : 'Expand video'}
                >
                  {modalFs ? '⊡' : '⛶'}
                </button>
                <button
                  type="button"
                  className="tutorial-video__close"
                  onClick={() => { setOpen(false); setModalFs(false); }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              {player}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      className={`tutorial-video${wideFull ? ' tutorial-video--widefull' : ''} ${className}`.trim()}
      aria-labelledby="tutorial-video-heading"
    >
      <div className="tutorial-video__header">
        <h2 id="tutorial-video-heading">{title}</h2>
        {subtitle && <p className="tutorial-video__subtitle">{subtitle}</p>}
      </div>
      <div className="tutorial-video__frame">{player}</div>
      <p className="tutorial-video__hint">
        Personal details are blurred in this guide. Search <strong>UClass Student Umunsi</strong> on Google or visit{' '}
        <a href="https://student.umunsi.com" target="_blank" rel="noopener noreferrer">student.umunsi.com</a>.
        Download the MP4 below for full 1080p quality.
      </p>
    </section>
  );
}

export function TutorialVideoDownloadLink({
  src = DEFAULT_SRC,
  label = 'Download tutorial video (MP4, 1080p)',
}) {
  return (
    <a className="tutorial-video__download" href={src} download="uclass-how-to-use-1080p.mp4">
      ⬇ {label}
    </a>
  );
}
