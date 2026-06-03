import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, UPLOADS_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import GuestShell from '../components/GuestShell';
import DocPreviewModal from '../components/DocPreviewModal';
import './Dashboard.css';
import './GuestDashboard.css';

const TABS = ['Announcements', 'Notes', 'Homework', 'Quizzes'];

function dueLabel(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  if (due < now) return { label: `Due ${due.toLocaleDateString()} (passed)`, color: '#dc2626' };
  return { label: `Due ${due.toLocaleDateString()}`, color: '#0f766e' };
}

export default function GuestClassPage() {
  const { classId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cls, setCls] = useState(null);
  const [tab, setTab] = useState('Announcements');
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    api
      .get(`/guest/classes/${classId}`, token)
      .then(setCls)
      .catch((e) => setError(e.message));
  }, [classId, token]);

  useEffect(() => {
    setError('');
    setLoading(true);
    const path =
      tab === 'Announcements'
        ? `/guest/classes/${classId}/announcements`
        : tab === 'Notes'
          ? `/guest/classes/${classId}/notes`
          : tab === 'Homework'
            ? `/guest/classes/${classId}/homework`
            : `/guest/classes/${classId}/quizzes`;
    api
      .get(path, token)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, classId, token]);

  return (
    <GuestShell title={cls?.name || 'Class'} backTo="/guest/dashboard">
      {cls && (
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#64748b' }}>
          {cls.subject ? `${cls.subject} · ` : ''}
          {cls.teacher_name}
          <span className="guest-readonly-tag" style={{ marginLeft: 8 }}>
            Guest view
          </span>
        </p>
      )}

      <p style={{ fontSize: 13, color: '#b45309', background: '#fffbeb', padding: '8px 12px', borderRadius: 8, marginBottom: 16 }}>
        Read-only: no classmates, leaderboard, discussions, or homework submission.
      </p>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

      {!loading && tab === 'Announcements' && (
        data.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No announcements yet.</p>
        ) : (
          data.map((a) => (
            <div key={a.id} className="item-card">
              <div className="item-card-body">
                <p>{a.content}</p>
                <div className="meta">
                  📢 {a.teacher_name} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))
        )
      )}

      {!loading && tab === 'Notes' && (
        data.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No notes yet.</p>
        ) : (
          data.map((n) => (
            <div key={n.id} className="item-card item-card-stack">
              <div className="item-card-body">
                <h3>📄 {n.title}</h3>
                {n.file_name && <div className="meta">{n.file_name}</div>}
              </div>
              {n.file_path && (
                <div className="item-card-btns">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setPreviewDoc({
                        fileUrl: `${UPLOADS_BASE}/download/notes/${n.file_path}?inline=1`,
                        fileName: n.file_name || n.title,
                      })
                    }
                  >
                    👁 Preview
                  </button>
                  <a
                    href={`${UPLOADS_BASE}/download/notes/${n.file_path}`}
                    download={n.file_name || true}
                    className="btn btn-primary btn-sm"
                  >
                    ⬇ Download
                  </a>
                </div>
              )}
            </div>
          ))
        )
      )}

      {!loading && tab === 'Homework' && (
        data.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No homework yet.</p>
        ) : (
          data.map((hw) => {
            const due = dueLabel(hw.due_date);
            return (
              <div key={hw.id} className="item-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="item-card-body">
                  <h3>📝 {hw.title}</h3>
                  {hw.description && <p>{hw.description}</p>}
                  {due && (
                    <div className="meta" style={{ color: due.color, fontWeight: 600 }}>
                      ⏰ {due.label}
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    View only — guests cannot submit homework.
                  </p>
                </div>
                {hw.file_path && (
                  <div className="item-card-btns">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        setPreviewDoc({
                          fileUrl: `${UPLOADS_BASE}/download/homework/${hw.file_path}?inline=1`,
                          fileName: hw.file_name || hw.title,
                        })
                      }
                    >
                      👁 Preview
                    </button>
                    <a
                      href={`${UPLOADS_BASE}/download/homework/${hw.file_path}`}
                      download={hw.file_name || true}
                      className="btn btn-primary btn-sm"
                    >
                      ⬇ Download
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )
      )}

      {!loading && tab === 'Quizzes' && (
        <>
          <p style={{ fontSize: 13, color: '#047857', marginBottom: 12 }}>
            All quizzes in this class from your sharing teacher — including new ones they add later.
          </p>
          {data.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>No quizzes yet.</p>
        ) : (
          data.map((q) => (
            <div key={q.id} className="item-card">
              <div className="item-card-body">
                <h3 style={{ margin: 0, fontSize: 15 }}>❓ {q.title}</h3>
                {q.description && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{q.description}</p>
                )}
                <span className="meta">{q.attempted ? '✓ Already taken' : 'Not taken yet'}</span>
              </div>
              <div className="item-card-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/guest/classes/${classId}/quizzes/${q.id}`)}
                >
                  {q.attempted ? 'View result' : 'Take quiz'}
                </button>
              </div>
            </div>
          ))
        )}
        </>
      )}

      {previewDoc && (
        <DocPreviewModal
          fileUrl={previewDoc.fileUrl}
          fileName={previewDoc.fileName}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </GuestShell>
  );
}
