import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UPLOADS_BASE } from '../api';
import DocPreviewModal from './DocPreviewModal';

const isSameDay = (a, b) => {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
};

const DESC_PREVIEW_LEN = 240;

// Split a description into paragraphs on blank lines so paragraph
// spacing typed by the teacher is shown as real spacing.
const toParagraphs = (text) =>
  String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

const LessonText = ({ text, style }) => (
  <div style={style}>
    {toParagraphs(text).map((p, i) => (
      <p key={i} style={{ margin: i === 0 ? 0 : '0.7em 0 0', whiteSpace: 'pre-wrap' }}>{p}</p>
    ))}
  </div>
);

// Recorded coaching lessons — today first, older ones grouped by subject.
// `lessons` rows come from GET /classes/:id/lessons or GET /classes/lessons/mine
// (the latter also carries class_name, shown when showClassName is true).
// `editable` (teacher view): always unlocked, quiz shown as a label, Edit/Delete buttons.
export default function RecordedLessons({ lessons = [], showClassName = false, emptyText = null, editable = false, onEdit, onDelete }) {
  const navigate = useNavigate();
  const [lessonListened, setLessonListened] = useState({}); // tasks unlock after the voice summary ends
  const [previewDoc, setPreviewDoc] = useState(null);
  const [readMore, setReadMore] = useState(null); // lesson whose full summary is open

  const todayRows = lessons.filter(l => l.created_at && isSameDay(l.created_at, new Date()));
  const olderGroups = new Map();
  lessons.filter(l => !(l.created_at && isSameDay(l.created_at, new Date()))).forEach(l => {
    const s = (l.subject && String(l.subject).trim()) || 'General';
    if (!olderGroups.has(s)) olderGroups.set(s, []);
    olderGroups.get(s).push(l);
  });

  const renderDescription = (l) => {
    if (!l.description) return null;
    const text = String(l.description);
    const tooLong = text.length > DESC_PREVIEW_LEN;
    return (
      <div style={{ marginTop: 8 }}>
        <LessonText text={tooLong ? `${text.slice(0, DESC_PREVIEW_LEN).trimEnd()}…` : text} />
        {tooLong && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 6 }}
            onClick={() => setReadMore(l)}
          >📖 Read more</button>
        )}
      </div>
    );
  };

  const renderLesson = (l) => {
    const unlocked = editable || !l.audio_path || lessonListened[l.id];
    return (
      <div key={l.id} className="item-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div className="item-card-body" style={{ flex: 1 }}>
            <h3>🎙 {l.title}</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {l.subject && (
                <span style={{ display: 'inline-block', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '1px 10px', fontSize: 12, fontWeight: 600, color: '#4338ca' }}>{l.subject}</span>
              )}
              {showClassName && l.class_name && (
                <span style={{ display: 'inline-block', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 20, padding: '1px 10px', fontSize: 12, fontWeight: 600, color: '#0e7490' }}>📚 {l.class_name}</span>
              )}
              {showClassName && l.teacher_name && (
                <span style={{ display: 'inline-block', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '1px 10px', fontSize: 12, fontWeight: 600, color: '#475569' }}>👩‍🏫 {l.teacher_name}</span>
              )}
            </div>
            {l.audio_path && (
              <audio
                controls
                preload="none"
                src={`${UPLOADS_BASE}/uploads/${l.audio_path}`}
                onEnded={() => setLessonListened(prev => ({ ...prev, [l.id]: true }))}
                style={{ width: '100%', marginTop: 6 }}
              />
            )}
            {!unlocked && (
              <p style={{ fontSize: 13, color: '#7c3aed', marginTop: 8, fontWeight: 600 }}>
                🎧 Listen to the voice summary to the end — the tasks and quiz will appear here.
              </p>
            )}
            {unlocked && (
              <>
                {renderDescription(l)}
                {l.file_name && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#c2410c', fontWeight: 600 }}>
                      📎 {l.file_name.replace(/^\d+-\d+\./, '')}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPreviewDoc({ fileUrl: `${UPLOADS_BASE}/download/lessons/${l.file_path}?inline=1`, fileName: l.file_name })}
                    >👁 Preview</button>
                    <a href={`${UPLOADS_BASE}/download/lessons/${l.file_path}`} download={l.file_name} className="btn btn-primary btn-sm">⬇ Download</a>
                  </div>
                )}
                {editable
                  ? (l.quiz_title && <div className="meta" style={{ marginTop: 8, color: '#7c3aed', fontWeight: 600 }}>❓ Quiz: {l.quiz_title}</div>)
                  : (l.quiz_id && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ marginTop: 10 }}
                      onClick={() => navigate(`/student/classes/${l.class_id}/quizzes/${l.quiz_id}`)}
                    >
                      ▶ Take Quiz{l.quiz_title ? `: ${l.quiz_title}` : ''}
                    </button>
                  ))}
              </>
            )}
            <div className="meta" style={{ marginTop: 8 }}>{new Date(l.created_at).toLocaleString()}</div>
          </div>
          {editable && (onEdit || onDelete) && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {onEdit && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(l)}>✏️ Edit</button>
              )}
              {onDelete && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(l)}>Delete</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {todayRows.length > 0 && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#065f46', marginBottom: 10 }}>🎙 Today's Recorded Lesson</div>
          {todayRows.map(renderLesson)}
        </div>
      )}
      {olderGroups.size > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#475569', marginBottom: 8 }}>📁 Previous lessons by subject</div>
          {[...olderGroups.entries()].map(([subj, items]) => (
            <details key={subj} style={{ marginBottom: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }} open={olderGroups.size === 1}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#1e293b', fontSize: 15 }}>
                📁 {subj} <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({items.length})</span>
              </summary>
              <div style={{ marginTop: 10 }}>{items.map(renderLesson)}</div>
            </details>
          ))}
        </div>
      )}
      {lessons.length === 0 && emptyText && (
        <p style={{ color: '#888', padding: '8px 0' }}>{emptyText}</p>
      )}

      {/* Full summary modal — the card (and its audio) stays mounted underneath,
          so the teacher's voice keeps playing while the student reads. */}
      {readMore && (
        <div
          className="modal-overlay"
          onClick={e => e.target === e.currentTarget && setReadMore(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: '#fff', borderRadius: 14, maxWidth: 640, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: 16 }}>🎙 {readMore.title}</strong>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReadMore(null)}>✕ Close</button>
            </div>
            <div style={{ padding: '16px 18px', overflowY: 'auto', fontSize: 15, lineHeight: 1.6, color: '#1e293b' }}>
              <LessonText text={readMore.description} />
            </div>
          </div>
        </div>
      )}

      {previewDoc && (
        <DocPreviewModal
          fileUrl={previewDoc.fileUrl}
          fileName={previewDoc.fileName}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
}
