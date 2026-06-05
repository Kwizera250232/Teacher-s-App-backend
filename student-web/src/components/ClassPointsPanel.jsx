import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import VerifiedBadge from './VerifiedBadge';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

function firstName(name) {
  return String(name || 'Student').trim().split(/\s+/)[0];
}

function initials(name) {
  return String(name || 'Student')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ClassPointsPanel({
  classId,
  token,
  classMeta,
  onError,
  onSuccess,
  onStudentClick,
  onParentInvite,
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [view, setView] = useState('students');
  const [showFeed, setShowFeed] = useState(true);
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [skillTarget, setSkillTarget] = useState(null);
  const [groupAward, setGroupAward] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPick, setGroupPick] = useState(new Set());
  const [timerSecs, setTimerSecs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get(`/classes/${classId}/classroom`, token);
      setData(res);
    } catch (e) {
      const msg = e.message || 'Could not load behavior points.';
      setLoadError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [classId, token, onError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (timerSecs == null || timerSecs <= 0) return undefined;
    const t = setTimeout(() => setTimerSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerSecs]);

  const students = data?.students || [];
  const groups = data?.groups || [];
  const skills = data?.skills || [];
  const events = data?.recent_events || [];
  const wholeClassPoints = data?.whole_class_points || 0;

  const awardPoints = async (payload) => {
    setBusy(true);
    try {
      await api.post(`/classes/${classId}/points`, payload, token);
      onSuccess?.('Points awarded.');
      setSkillTarget(null);
      setSelectedIds(new Set());
      setMultiMode(false);
      setGroupAward(null);
      await load();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const undoEvent = async (eventId) => {
    try {
      await api.delete(`/classes/${classId}/points/${eventId}`, token);
      onSuccess?.('Undone.');
      await load();
    } catch (e) {
      onError?.(e.message);
    }
  };

  const resetPoints = async () => {
    if (!window.confirm('Reset all behavior points for this class?')) return;
    try {
      await api.post(`/classes/${classId}/points/reset`, {}, token);
      onSuccess?.('Points reset.');
      await load();
    } catch (e) {
      onError?.(e.message);
    }
  };

  const openSkillPicker = (target) => {
    setSkillTarget(target);
    setGroupAward(null);
  };

  const handleStudentClick = (student, ev) => {
    if (ev?.target?.closest?.('button')) return;
    if (multiMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(student.id)) next.delete(student.id);
        else next.add(student.id);
        return next;
      });
      return;
    }
    openSkillPicker({ type: 'student', student });
  };

  const confirmSkill = (skill) => {
    if (groupAward) {
      awardPoints({ group_id: groupAward.id, skill, value: 1 });
      return;
    }
    if (!skillTarget) return;
    if (skillTarget.type === 'student') {
      awardPoints({ student_id: skillTarget.student.id, skill, value: 1 });
    } else if (skillTarget.type === 'whole_class') {
      awardPoints({ whole_class: true, skill, value: 1 });
    } else if (skillTarget.type === 'multi') {
      awardPoints({ student_ids: skillTarget.ids, skill, value: 1 });
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setBusy(true);
    try {
      await api.post(
        `/classes/${classId}/groups`,
        { name: groupName.trim(), student_ids: [...groupPick] },
        token
      );
      onSuccess?.('Group created.');
      setShowGroupModal(false);
      setGroupName('');
      setGroupPick(new Set());
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const renderStudentCard = (s, i, { showParentInvite = true, pickForGroup = false } = {}) => {
    const displayName = String(s.name || 'Student').trim();
    const joinedLabel = s.joined_at
      ? new Date(s.joined_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    const bg = AVATAR_COLORS[s.id % AVATAR_COLORS.length];
    const points = s.points || 0;
    const selected = pickForGroup ? groupPick.has(s.id) : selectedIds.has(s.id);

    return (
      <div
        key={s.id}
        className={`class-roster-card${selected ? ' class-roster-card--selected' : ''}`}
        onClick={(ev) => {
          if (pickForGroup) {
            setGroupPick((prev) => {
              const next = new Set(prev);
              if (next.has(s.id)) next.delete(s.id);
              else next.add(s.id);
              return next;
            });
            return;
          }
          handleStudentClick(s, ev);
        }}
        onKeyDown={(ev) => ev.key === 'Enter' && handleStudentClick(s, ev)}
        role="button"
        tabIndex={0}
      >
        <div className="class-roster-avatar" style={{ background: bg }}>
          {points > 0 && <span className="class-roster-point-badge">{points}</span>}
          {initials(displayName)}
        </div>
        <div
          className="class-roster-name"
          onClick={(ev) => {
            ev.stopPropagation();
            if (!pickForGroup && !multiMode && onStudentClick) onStudentClick(s);
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.stopPropagation();
              if (!pickForGroup && !multiMode && onStudentClick) onStudentClick(s);
            }
          }}
          role={onStudentClick ? 'button' : undefined}
          tabIndex={onStudentClick ? 0 : undefined}
        >
          <span>{firstName(displayName)}</span>
          <VerifiedBadge
            size={11}
            info={{
              items: [
                { icon: '📚', label: 'Class', value: classMeta?.name },
                { icon: '📅', label: 'Joined', value: joinedLabel },
                { icon: '👨‍🏫', label: 'Teacher', value: classMeta?.teacher_name },
                { icon: '⭐', label: 'Points', value: String(points) },
              ],
            }}
          />
        </div>
        {showParentInvite && !pickForGroup && onParentInvite && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}
            onClick={(ev) => {
              ev.stopPropagation();
              onParentInvite({ studentId: s.id, studentName: displayName });
            }}
          >
            👪 Parent invite
          </button>
        )}
      </div>
    );
  };

  if (loading && !data) {
    return <p style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading students…</p>;
  }

  if (loadError && !data) {
    return (
      <div className="alert alert-error" style={{ marginBottom: 16 }}>
        <strong>Behavior points unavailable.</strong> {loadError}
        <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="class-points-panel">
      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#4b5563' }}>
        Tap a student to award <strong>+1</strong> points. Use <strong>Whole class</strong>, <strong>Groups</strong>, or the tools below.
      </p>
      <div className="class-roster-toolbar">
        <div className="tabs" style={{ marginBottom: 0, flex: '1 1 auto', minWidth: 200 }}>
          <button type="button" className={`tab ${view === 'students' ? 'active' : ''}`} onClick={() => setView('students')}>
            Students
          </button>
          <button type="button" className={`tab ${view === 'groups' ? 'active' : ''}`} onClick={() => setView('groups')}>
            Groups
          </button>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowFeed((v) => !v)}>
          {showFeed ? 'Hide activity' : 'Show activity'}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowGroupModal(true)}>
          Add group
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={resetPoints}>
          Reset points
        </button>
      </div>

      <div className="class-roster-tools">
        <button
          type="button"
          className={`btn btn-secondary btn-sm${multiMode ? ' active' : ''}`}
          onClick={() => { setMultiMode((m) => !m); setSelectedIds(new Set()); }}
        >
          Select multiple
        </button>
        {multiMode && selectedIds.size > 0 && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => openSkillPicker({ type: 'multi', ids: [...selectedIds] })}
          >
            Award {selectedIds.size} selected
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (!students.length) return;
            const pick = students[Math.floor(Math.random() * students.length)];
            openSkillPicker({ type: 'student', student: pick });
          }}
        >
          Random
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTimerSecs(300)}>
          Timer
        </button>
      </div>

      <div className={`class-points-layout${showFeed ? ' with-feed' : ''}`}>
        <div>
          {view === 'students' && (
            <div className="class-roster-grid">
              <div
                className="class-roster-card"
                onClick={() => students.length && openSkillPicker({ type: 'whole_class' })}
                role="button"
                tabIndex={0}
              >
                <div className="class-roster-avatar class-roster-avatar--whole">
                  {wholeClassPoints > 0 && <span className="class-roster-point-badge">{wholeClassPoints}</span>}
                  👥
                </div>
                <div className="class-roster-name">Whole class</div>
              </div>
              {students.map((s, i) => renderStudentCard(s, i))}
            </div>
          )}

          {view === 'groups' && (
            <div className="class-roster-grid">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="class-roster-card"
                  onClick={() => setGroupAward(g)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="class-roster-avatar class-roster-avatar--group">
                    {(g.points || 0) > 0 && <span className="class-roster-point-badge">{g.points}</span>}
                    {g.student_ids?.length || 0}
                  </div>
                  <div className="class-roster-name">{g.name}</div>
                </div>
              ))}
              {!groups.length && (
                <p style={{ padding: 20, color: '#888', width: '100%' }}>No groups yet. Use Add group above.</p>
              )}
            </div>
          )}

          {!students.length && view === 'students' && (
            <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>No students yet.</p>
          )}
        </div>

        {showFeed && (
          <aside className="class-points-feed">
            <div className="section-header" style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 16 }}>Points activity</h2>
            </div>
            {events.length === 0 && (
              <p style={{ fontSize: 13, color: '#888', padding: '8px 0' }}>Tap a student to award points.</p>
            )}
            {events.map((ev) => (
              <div key={ev.id} className={`item-card${ev.undone ? ' class-points-feed--undone' : ''}`} style={{ padding: 12 }}>
                <div className="item-card-body">
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {ev.undone ? (
                      <s>
                        +{ev.value} {ev.student_name} — {ev.skill_meta?.label}
                      </s>
                    ) : (
                      <>
                        <strong>+{ev.value}</strong> {ev.student_name} — {ev.skill_meta?.emoji} {ev.skill_meta?.label}
                      </>
                    )}
                  </p>
                  <div className="meta">
                    {formatTime(ev.created_at)} · {ev.teacher_name}
                  </div>
                </div>
                {!ev.undone && (
                  <div className="item-card-actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => undoEvent(ev.id)}>
                      Undo
                    </button>
                  </div>
                )}
              </div>
            ))}
          </aside>
        )}
      </div>

      {(skillTarget || groupAward) && (
        <div className="class-points-modal-backdrop" onClick={() => { setSkillTarget(null); setGroupAward(null); }}>
          <div className="class-points-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px' }}>
              {groupAward
                ? `Award ${groupAward.name}`
                : skillTarget?.type === 'whole_class'
                  ? 'Award whole class'
                  : skillTarget?.type === 'multi'
                    ? `Award ${skillTarget.ids.length} students`
                    : `Award ${firstName(skillTarget?.student?.name)}`}
            </h3>
            <div className="class-skill-grid">
              {skills.map((sk) => (
                <button
                  key={sk.id}
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => confirmSkill(sk.id)}
                >
                  {sk.emoji} {sk.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => { setSkillTarget(null); setGroupAward(null); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showGroupModal && (
        <div className="class-points-modal-backdrop" onClick={() => setShowGroupModal(false)}>
          <div className="class-points-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px' }}>Create group</h3>
            <form onSubmit={createGroup}>
              <input
                className="form-group"
                style={{ width: '100%', padding: '10px 14px', border: '2px solid #e8e8e8', borderRadius: 8, marginBottom: 12 }}
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                required
              />
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>Select students</p>
              <div className="class-roster-grid" style={{ marginBottom: 12 }}>
                {students.map((s, i) => renderStudentCard(s, i, { showParentInvite: false, pickForGroup: true }))}
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy || !groupName.trim()}>
                Create group
              </button>
            </form>
          </div>
        </div>
      )}

      {timerSecs != null && (
        <div className="class-timer-overlay">
          <div className="class-timer-display">
            {Math.floor(timerSecs / 60)}:{String(timerSecs % 60).padStart(2, '0')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setTimerSecs(300)}>5 min</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setTimerSecs(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
