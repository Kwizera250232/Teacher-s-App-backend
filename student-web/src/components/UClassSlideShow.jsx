import { useEffect, useState } from 'react';

const SLIDES = [
  {
    src: '/images/uclass-slide/tr-children-reading-together-floor.webp',
    kicker: 'UCLASS',
    title: 'We care about Rwandan Education!',
    sub: 'Real books, quizzes and classes — built for Rwanda.',
  },
  {
    src: '/images/uclass-slide/tr-teacher-showing-book.webp',
    kicker: 'Founder & CEO',
    title: 'Kwizera Jean de Dieu',
    sub: 'UClass Founder — leading learning with technology.',
  },
  {
    src: '/images/uclass-slide/tr-three-children-smiling-with-books.webp',
    kicker: 'UCLASS',
    title: 'Through Technology, we can do it',
    sub: 'Students learning, reading and winning together.',
  },
];

/** Auto-sliding hero — UClass students + Founder/CEO, with the mission text. */
export default function UClassSlideShow() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % SLIDES.length), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      aria-label="UClass — we care about Rwandan Education"
      style={{ position: 'relative', marginTop: 18, borderRadius: 24, overflow: 'hidden', boxShadow: '0 12px 32px rgba(79,70,229,.18)', height: 'min(430px, 62vw)', minHeight: 260 }}
    >
      {SLIDES.map((s, idx) => (
        <div
          key={s.src}
          aria-hidden={idx !== i}
          style={{
            position: 'absolute', inset: 0,
            opacity: idx === i ? 1 : 0,
            transition: 'opacity .8s ease',
          }}
        >
          <img
            src={s.src}
            alt={s.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(30,20,80,.78) 0%, rgba(30,20,80,.35) 55%, transparent 100%)' }} />
        </div>
      ))}

      {/* Caption */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(16px,4vw,34px)', color: '#fff' }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#c4b5fd' }}>
          {SLIDES[i].kicker}
        </p>
        <h2 style={{ margin: 0, fontSize: 'clamp(20px,3.6vw,36px)', fontWeight: 800, lineHeight: 1.15, textShadow: '0 2px 12px rgba(0,0,0,.4)' }}>
          {SLIDES[i].title}
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: 'clamp(13px,1.6vw,16px)', color: '#e2e8f0', maxWidth: 460 }}>
          {SLIDES[i].sub}
        </p>
      </div>

      {/* Dots */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6 }}>
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            aria-label={`Slide ${idx + 1}`}
            onClick={() => setI(idx)}
            style={{
              width: idx === i ? 22 : 8, height: 8, borderRadius: 99, border: 'none',
              background: idx === i ? '#fbbf24' : 'rgba(255,255,255,.6)', cursor: 'pointer', transition: 'all .3s',
            }}
          />
        ))}
      </div>
    </section>
  );
}
