import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ClassDeanHelp from './ClassDeanHelp';
import GroupAchievementHub from './GroupAchievementHub';
import CrownPickerSection from './CrownPickerSection';
import DisplayedTitleBadge from './DisplayedTitleBadge';
import './StudentMyGroups.css';

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Student';
}

function statusLabel(a) {
  if (a.status === 'submitted') {
    return { text: `Done · ${a.score}/${a.total}`, color: '#166534', emoji: '🏁', tone: 'done' };
  }
  if (a.status === 'active' && a.started_by_student_id) {
    const who = a.started_by_name ? ` · ${firstName(a.started_by_name)} started` : '';
    return { text: `In progress${who}`, color: '#b45309', emoji: '🔥', tone: 'active' };
  }
  if (a.status === 'active' || a.status === 'assigned') {
    return { text: 'New — open now!', color: '#059669', emoji: '✨', tone: 'new' };
  }
  return { text: 'Open now', color: '#059669', emoji: '🚀', tone: 'new' };
}

function uniqueAssignments(list) {
  const statusRank = (s) => (s === 'submitted' ? 3 : s === 'active' ? 2 : 1);
  const byQuiz = new Map();
  for (const a of list || []) {
    if (!a?.id) continue;
    const key = a.quiz_id != null ? `q${a.quiz_id}` : `a${a.id}`;
    const prev = byQuiz.get(key);
    if (!prev) {
      byQuiz.set(key, a);
      continue;
    }
    if (statusRank(a.status) > statusRank(prev.status)) {
      byQuiz.set(key, a);
    } else if (statusRank(a.status) === statusRank(prev.status)) {
      const aTs = new Date(a.submitted_at || a.created_at || 0).getTime();
      const pTs = new Date(prev.submitted_at || prev.created_at || 0).getTime();
      if (aTs >= pTs) byQuiz.set(key, a);
    }
  }
  return [...byQuiz.values()].sort(
    (x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0)
  );
}

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function GroupRankBanner({ group }) {
  if (!group.total_groups || group.total_groups < 2) return null;
  return (
    <div className="sg-rank-banner">
      <div className="sg-rank-pill">
        <span className="sg-rank-medal">{rankMedal(group.points_rank)}</span>
        <span>Points rank · {group.points_rank} of {group.total_groups}</span>
      </div>
      {group.quiz_rank != null && (
        <div className="sg-rank-pill sg-rank-pill--quiz">
          <span className="sg-rank-medal">{rankMedal(group.quiz_rank)}</span>
          <span>Quiz rank · {group.quiz_rank} of {group.total_groups}</span>
        </div>
      )}
    </div>
  );
}

function EarnedPointsWall({ events, total }) {
  const stickerCounts = useMemo(() => {
    const map = {};
    for (const ev of events || []) {
      const key = ev.skill || 'on_task';
      if (!map[key]) {
        map[key] = { ...ev.skill_meta, count: 0, events: [] };
      }
      map[key].count += ev.value || 1;
      map[key].events.push(ev);
    }
    return Object.values(map);
  }, [events]);

  return (
    <section className="sg-earned-section">
      <div className="sg-earned-header">
        <h4>🏆 Earned points</h4>
        <span className="sg-earned-total">{total || 0} total</span>
      </div>
      {total === 0 ? (
        <p className="sg-earned-empty">
          When your teacher awards your team, stickers appear here. Work together to fill this wall!
        </p>
      ) : (
        <>
          <div className="sg-sticker-grid">
            {stickerCounts.map((s) => (
              <div key={s.id || s.label} className="sg-sticker" title={s.label}>
                <span className="sg-sticker-emoji">{s.emoji}</span>
                <span className="sg-sticker-count">×{s.count}</span>
                <span className="sg-sticker-label">{s.label}</span>
              </div>
            ))}
          </div>
          <ul className="sg-earned-feed">
            {(events || []).slice(0, 8).map((ev) => (
              <li key={ev.id}>
                <span className="sg-earned-feed-emoji">{ev.skill_meta?.emoji}</span>
                <span>
                  <strong>+{ev.value}</strong> {firstName(ev.student_name)}
                  <span className="sg-earned-feed-skill"> · {ev.skill_meta?.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TeamRoster({
  members,
  leaderId,
  leaderName,
  teamRoles,
  currentUserId,
  onClaimLeader,
  onSetRole,
  busy,
}) {
  const [roleOpen, setRoleOpen] = useState(false);

  return (
    <section className="sg-roster">
      <div className="sg-roster-head">
        <h4>👥 Team roster</h4>
        {leaderName ? (
          <span className="sg-leader-badge">👑 Leader: {firstName(leaderName)}</span>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-sm sg-claim-leader"
            disabled={busy}
            onClick={onClaimLeader}
          >
            👑 Become leader
          </button>
        )}
      </div>
      <ul className="sg-member-list">
        {members?.map((m) => (
          <li key={m.id} className={`sg-member${m.is_leader ? ' sg-member--leader' : ''}`}>
            <div className="sg-member-avatar">
              {m.is_leader ? '👑' : (m.team_role_meta?.emoji || '🧑‍🎓')}
            </div>
            <div className="sg-member-info">
              <strong>{firstName(m.name)}{m.id === currentUserId ? ' (you)' : ''}</strong>
              {m.team_role_meta && (
                <span className="sg-member-role">{m.team_role_meta.label}</span>
              )}
              {m.displayed_crown && (
                <span className="sg-member-crown">
                  <DisplayedTitleBadge title={m.displayed_crown} compact />
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {currentUserId && members?.some((m) => m.id === currentUserId) && (
        <div className="sg-my-role">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRoleOpen((o) => !o)}
          >
            🏷️ Pick your team rank
          </button>
          {roleOpen && (
            <div className="sg-role-picker">
              {(teamRoles || []).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => { onSetRole(r.id); setRoleOpen(false); }}
                >
                  {r.emoji} {r.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy}
                onClick={() => { onSetRole(''); setRoleOpen(false); }}
              >
                Clear rank
              </button>
            </div>
          )}
        </div>
      )}
      {leaderId === currentUserId && members?.length > 1 && (
        <p className="sg-leader-hint">You are leader — motivate your team and start group quizzes first!</p>
      )}
    </section>
  );
}

export default function StudentMyGroupsPanel({
  groups,
  classId,
  className,
  token,
  loading,
  error,
  initialGroupId,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [openGroupId, setOpenGroupId] = useState(initialGroupId ? Number(initialGroupId) : null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadDetail = () => {
    if (!openGroupId || !token) return;
    setDetailLoading(true);
    setDetailError('');
    api
      .get(`/classes/${classId}/my-groups/${openGroupId}`, token)
      .then(setDetail)
      .catch((e) => setDetailError(e.message))
      .finally(() => setDetailLoading(false));
  };

  useEffect(() => {
    if (initialGroupId) setOpenGroupId(Number(initialGroupId));
  }, [initialGroupId]);

  useEffect(() => {
    if (!openGroupId || !token) {
      setDetail(null);
      return;
    }
    loadDetail();
  }, [openGroupId, classId, token]);

  const claimLeader = async () => {
    setBusy(true);
    try {
      await api.put(`/classes/${classId}/my-groups/${openGroupId}/leader`, {}, token);
      loadDetail();
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (teamRole) => {
    setBusy(true);
    try {
      await api.put(`/classes/${classId}/my-groups/${openGroupId}/my-role`, { team_role: teamRole }, token);
      loadDetail();
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="sg-loading">Loading your teams…</p>;
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (!groups?.length) {
    return (
      <div className="sg-empty">
        <p className="sg-empty-icon">👥</p>
        <p><strong>You are not in a team yet.</strong></p>
        <p className="sg-empty-hint">
          Ask your teacher to add you to a group. Teams earn stickers, climb ranks, and tackle quizzes together!
        </p>
      </div>
    );
  }

  if (openGroupId) {
    const summary = groups.find((g) => g.id === openGroupId);
    const g = detail || summary;
    const earned = detail?.earned_points ?? detail?.points ?? 0;

    return (
      <div className="sg-detail">
        <button type="button" className="btn btn-outline btn-sm sg-back" onClick={() => setOpenGroupId(null)}>
          ← All teams
        </button>

        {detailLoading && !detail ? (
          <p className="sg-loading">Opening team…</p>
        ) : (
          <>
            <header className="sg-detail-hero">
              <div className="sg-detail-hero-bg" />
              <h3 className="sg-detail-title">👥 {g?.name}</h3>
              <p className="sg-detail-sub">Your class team · work together, earn stickers, win ranks</p>
              <GroupRankBanner group={g} />
              <div className="sg-detail-scores">
                <div className="sg-score-card sg-score-card--points">
                  <span className="sg-score-val">{earned}</span>
                  <span className="sg-score-lbl">Earned points</span>
                </div>
                <div className="sg-score-card">
                  <span className="sg-score-val">
                    {g?.quiz_marks ?? 0}
                    {g?.quiz_marks_total > 0 ? `/${g.quiz_marks_total}` : ''}
                  </span>
                  <span className="sg-score-lbl">Quiz marks</span>
                </div>
              </div>
            </header>

            <TeamRoster
              members={detail?.members || g?.members}
              leaderId={detail?.leader_id ?? g?.leader_id}
              leaderName={detail?.leader_name ?? g?.leader_name}
              teamRoles={detail?.team_roles}
              currentUserId={user?.id}
              onClaimLeader={claimLeader}
              onSetRole={setRole}
              busy={busy}
            />

            <EarnedPointsWall events={detail?.point_events} total={earned} />

            <CrownPickerSection
              classId={classId}
              token={token}
              achievements={detail?.my_achievements}
              displayedTitle={detail?.displayed_title}
              onUpdated={loadDetail}
            />

            <GroupAchievementHub classId={classId} groupId={openGroupId} token={token} />

            <div className="sg-dean-wrap">
              <ClassDeanHelp
                token={token}
                classId={classId}
                className={className}
                quizHint={g?.name ? `Team ${g.name} — ask about group work and quizzes` : ''}
              />
            </div>

            {detailError && <div className="alert alert-error">{detailError}</div>}

            <section className="sg-quizzes-section">
              <div className="sg-quizzes-heading-row">
                <h4 className="sg-quizzes-heading">📝 Group quizzes</h4>
                <span className="sg-quizzes-sparkle">Team power!</span>
              </div>
              {!uniqueAssignments(detail?.assignments).length ? (
                <p className="sg-quizzes-empty">
                  No quiz yet — when your teacher drops one here, your squad tackles it together! 🎯
                </p>
              ) : (
                <div className="sg-quiz-list">
                  {uniqueAssignments(detail.assignments).map((a) => {
                    const st = statusLabel(a);
                    return (
                      <div key={a.id} className={`sg-quiz-card sg-quiz-card--${st.tone}`}>
                        <div className="sg-quiz-card-sparkle" aria-hidden />
                        <div className="sg-quiz-card-top">
                          <span className="sg-quiz-title">
                            <span className="sg-quiz-emoji">{st.emoji}</span> {a.quiz_title}
                          </span>
                          <span className="sg-quiz-status" style={{ color: st.color }}>{st.text}</span>
                        </div>
                        {a.submitted_by_name && a.status === 'submitted' && (
                          <p className="sg-quiz-submitter">
                            🙌 Submitted by {firstName(a.submitted_by_name)}
                          </p>
                        )}
                        {a.quiz_description && (
                          <p className="sg-quiz-desc">{a.quiz_description}</p>
                        )}
                        <button
                          type="button"
                          className={`btn btn-sm sg-quiz-btn${a.status === 'submitted' ? ' sg-quiz-btn--done' : ''}`}
                          onClick={() => navigate(`/student/classes/${classId}/group-quizzes/${a.id}`)}
                        >
                          {a.status === 'submitted' ? '🏆 View result' : '🚀 Open group quiz'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sg-list">
      <p className="sg-list-hint">
        Open a team to see earned stickers, your rank, and group quizzes — points stay inside your team room.
      </p>
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          className="sg-list-card"
          onClick={() => setOpenGroupId(g.id)}
        >
          <div className="sg-list-card-head">
            <div>
              <strong className="sg-list-name">👥 {g.name}</strong>
              {g.leader_name && (
                <span className="sg-list-leader">👑 {firstName(g.leader_name)}</span>
              )}
              {g.displayed_title && (
                <DisplayedTitleBadge title={g.displayed_title} compact />
              )}
            </div>
            {(g.pending_count > 0 || g.assignment_count > 0) && (
              <span className="sg-list-badge">
                {g.pending_count > 0 ? `${g.pending_count} to do` : `${g.assignment_count} quiz`}
              </span>
            )}
          </div>
          <div className="sg-list-meta">
            {g.total_groups > 1 && g.points_rank && (
              <span className="sg-list-rank">{rankMedal(g.points_rank)} Rank {g.points_rank}/{g.total_groups}</span>
            )}
            {g.has_earned_points && (
              <span className="sg-list-stickers">🏆 Stickers inside →</span>
            )}
            {g.quiz_marks_total > 0 && (
              <span className="sg-list-quiz">📝 {g.quiz_marks}/{g.quiz_marks_total} marks</span>
            )}
          </div>
          <span className="sg-list-open">Enter team room →</span>
        </button>
      ))}
    </div>
  );
}
