import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ClassMomentsHero from './ClassMomentsHero';
import ClassMomentsDashboardBlock from './ClassMomentsDashboardBlock';

const STORAGE_KEY = 'student_class_updates_fold_open';

/**
 * Class Now — photos + group work in one fold, shown at top of student dashboard.
 */
export default function ClassMomentsFold({
  preview,
  feedPath = '/student/class-moments',
  defaultOpen = true,
  token,
  userRole = 'student',
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      /* ignore */
    }
    return defaultOpen;
  });

  const count = preview?.today_count ?? 0;
  const unread = preview?.unread ?? 0;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  const summary =
    count > 0
      ? `${count} moment${count === 1 ? '' : 's'} today`
      : 'Class photos & stories from your school';

  return (
    <section className="cm-fold cm-fold--class-now" id="student-class-now" aria-label="Class Now">
      <div className="cm-fold-header">
        <button
          type="button"
          className="cm-fold-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="cm-fold-toggle-icon" aria-hidden>
            {open ? '▼' : '▶'}
          </span>
          <span className="cm-fold-toggle-text">
            <span className="cm-fold-title">📸 Class Now</span>
            <span className="cm-fold-sub">{summary}</span>
          </span>
          {unread > 0 && (
            <span className="cm-fold-badge">{unread} new</span>
          )}
        </button>
        <button
          type="button"
          className="cm-fold-open-link"
          onClick={() => navigate(feedPath)}
        >
          Open feed
        </button>
      </div>
      {open && (
        <div className="cm-fold-body cm-fold-body--class-now">
          <ClassMomentsHero preview={preview} feedPath={feedPath} />
          {token && (
            <ClassMomentsDashboardBlock
              token={token}
              userRole={userRole}
              preview={preview}
              feedPath={feedPath}
              hideHero
              showOpenAll={false}
            />
          )}
          <p className="cm-fold-hint">
            Group quizzes are inside each class → <strong>Groups</strong> tab. Homework and solo quizzes are on each class card.
          </p>
        </div>
      )}
    </section>
  );
}
