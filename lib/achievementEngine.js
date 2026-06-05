const pool = require('../db');
const { titleMeta, formatFeedHeadline } = require('./achievementCatalog');
const { insertUserNotification } = require('./classMomentNotify');

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-M${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getStudentName(studentId) {
  const r = await pool.query('SELECT name FROM users WHERE id = $1', [studentId]);
  return r.rows[0]?.name || 'Student';
}

async function getGroupName(groupId) {
  if (!groupId) return null;
  const r = await pool.query('SELECT name FROM class_groups WHERE id = $1', [groupId]);
  return r.rows[0]?.name || null;
}

async function grantAchievement({
  studentId,
  classId,
  groupId,
  titleKey,
  periodKey = 'all_time',
  metadata = {},
  silent = false,
}) {
  if (!titleMeta(titleKey)) return null;

  const ins = await pool.query(
    `INSERT INTO student_achievements (student_id, class_id, group_id, title_key, period_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (student_id, class_id, title_key, period_key) DO NOTHING
     RETURNING id, title_key, earned_at, metadata`,
    [studentId, classId, groupId, titleKey, periodKey, JSON.stringify(metadata)]
  );
  if (!ins.rows.length) return null;

  const studentName = await getStudentName(studentId);
  const groupName = await getGroupName(groupId);
  const headline = formatFeedHeadline({
    studentName,
    groupName,
    titleKey,
    metadata: { ...metadata, ...(ins.rows[0].metadata || {}) },
  });

  let feedId = null;
  if (!silent) {
    const feed = await pool.query(
      `INSERT INTO achievement_feed (student_id, class_id, group_id, title_key, headline, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [studentId, classId, groupId, titleKey, headline.slice(0, 500), JSON.stringify(metadata)]
    );
    feedId = feed.rows[0]?.id;

    const skill = titleMeta(titleKey);
    const notifyPayload = {
      type: 'achievement_earned',
      class_id: classId,
      group_id: groupId,
      title_key: titleKey,
      url: groupId
        ? `/student/classes/${classId}?tab=Groups&group=${groupId}`
        : `/student/classes/${classId}?tab=Leaderboard`,
    };
    insertUserNotification({
      userId: studentId,
      type: 'achievement_earned',
      title: `${skill?.emoji || '🏆'} You earned ${skill?.label || 'a title'}!`,
      body: 'Pick a crown to wear — classmates will see it outside your team.',
      payload: notifyPayload,
    }).catch((e) => console.error('[achievement notify self]', e.message));

    if (groupId) {
      const teammates = await pool.query(
        `SELECT student_id FROM class_group_members
         WHERE group_id = $1 AND student_id <> $2`,
        [groupId, studentId]
      );
      for (const row of teammates.rows) {
        insertUserNotification({
          userId: row.student_id,
          type: 'achievement_earned',
          title: `${skill?.emoji || '🏆'} Teammate celebration!`,
          body: headline.slice(0, 180),
          payload: notifyPayload,
        }).catch(() => {});
      }
    }
  }

  const meta = titleMeta(titleKey);
  return {
    id: ins.rows[0].id,
    title_key: titleKey,
    earned_at: ins.rows[0].earned_at,
    metadata,
    feed_id: feedId,
    ...meta,
  };
}

async function evaluateQuizSubmit({
  studentId,
  classId,
  groupId = null,
  quizId,
  score,
  total,
  questions = [],
  startedAt = null,
  submittedAt = new Date(),
  skipWeeklyRefresh = false,
}) {
  const awarded = [];
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const baseMeta = { quiz_id: quizId, score, total, percentage: pct, group_id: groupId };

  if (pct >= 95) {
    const a = await grantAchievement({
      studentId,
      classId,
      groupId,
      titleKey: 'quiz_champion',
      metadata: baseMeta,
    });
    if (a) awarded.push(a);
  }

  const prev = await pool.query(
    `SELECT qa.score, qa.total FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     WHERE qa.student_id = $1 AND q.class_id = $2 AND qa.quiz_id <> $3
       AND COALESCE(qa.is_guest, FALSE) = FALSE
     ORDER BY qa.attempted_at DESC LIMIT 1`,
    [studentId, classId, quizId]
  );
  if (prev.rows.length) {
    const p = prev.rows[0];
    const prevPct = p.total > 0 ? Math.round((p.score / p.total) * 100) : 0;
    if (pct - prevPct >= 15) {
      const a = await grantAchievement({
        studentId,
        classId,
        groupId,
        titleKey: 'rising_star',
        metadata: { ...baseMeta, previous_percentage: prevPct, improvement: pct - prevPct },
      });
      if (a) awarded.push(a);
    }
  }

  const hasProblemTypes = questions.some((q) =>
    ['matching', 'fill_blank'].includes(q.question_type)
  );
  if (hasProblemTypes && pct >= 90) {
    const a = await grantAchievement({
      studentId,
      classId,
      groupId,
      titleKey: 'problem_solver',
      metadata: baseMeta,
    });
    if (a) awarded.push(a);
  }

  if (groupId && startedAt && pct >= 80) {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(submittedAt).getTime();
    const mins = (endMs - startMs) / 60000;
    if (mins > 0 && mins <= 20) {
      const a = await grantAchievement({
        studentId,
        classId,
        groupId,
        titleKey: 'fast_learner',
        metadata: { ...baseMeta, minutes: Math.round(mins) },
      });
      if (a) awarded.push(a);
    }
  }

  const km = await checkKnowledgeMaster(studentId, classId, groupId);
  if (km) awarded.push(km);

  if (!skipWeeklyRefresh) {
    const weekly = await refreshWeeklyTitles(classId, groupId);
    awarded.push(...weekly);
  }

  return awarded.filter(Boolean);
}

async function checkKnowledgeMaster(studentId, classId, groupId = null) {
  const quizzes = await pool.query(
    `SELECT q.id FROM quizzes q
     WHERE q.class_id = $1
       AND q.id NOT IN (
         SELECT DISTINCT quiz_id FROM class_group_quiz_assignments WHERE class_id = $1
       )`,
    [classId]
  );
  if (!quizzes.rows.length) return null;

  const attempted = await pool.query(
    `SELECT COUNT(DISTINCT qa.quiz_id)::int AS c
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     WHERE qa.student_id = $1 AND q.class_id = $2
       AND COALESCE(qa.is_guest, FALSE) = FALSE`,
    [studentId, classId]
  );
  if (attempted.rows[0]?.c < quizzes.rows.length) return null;

  return grantAchievement({
    studentId,
    classId,
    groupId,
    titleKey: 'knowledge_master',
    metadata: { quizzes_completed: attempted.rows[0].c },
  });
}

async function refreshWeeklyTitles(classId, groupId = null) {
  const awarded = [];
  const weekKey = isoWeekKey();
  const monthK = monthKey();

  const activeRes = await pool.query(
    `SELECT cm.student_id, COUNT(*)::int AS activity
     FROM (
       SELECT qa.student_id, qa.attempted_at AS at
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       WHERE q.class_id = $1 AND qa.attempted_at >= NOW() - INTERVAL '7 days'
         AND COALESCE(qa.is_guest, FALSE) = FALSE
       UNION ALL
       SELECT e.student_id, e.created_at AS at
       FROM class_point_events e
       WHERE e.class_id = $1 AND NOT e.undone AND e.created_at >= NOW() - INTERVAL '7 days'
     ) cm
     GROUP BY cm.student_id
     ORDER BY activity DESC
     LIMIT 1`,
    [classId]
  );
  if (activeRes.rows[0]) {
    const sid = activeRes.rows[0].student_id;
    const a = await grantAchievement({
      studentId: sid,
      classId,
      groupId,
      titleKey: 'most_active_learner',
      periodKey: weekKey,
      metadata: { activity_count: activeRes.rows[0].activity },
    });
    if (a) awarded.push(a);
  }

  const accRes = await pool.query(
    `SELECT qa.student_id,
            ROUND(AVG(qa.score::numeric / NULLIF(qa.total, 0)) * 100)::int AS avg_pct
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     JOIN users u ON u.id = qa.student_id AND u.role = 'student'
     WHERE q.class_id = $1 AND COALESCE(qa.is_guest, FALSE) = FALSE
     GROUP BY qa.student_id
     HAVING COUNT(*) >= 1
     ORDER BY avg_pct DESC
     LIMIT 1`,
    [classId]
  );
  if (accRes.rows[0]) {
    const a = await grantAchievement({
      studentId: accRes.rows[0].student_id,
      classId,
      groupId,
      titleKey: 'accuracy_expert',
      periodKey: weekKey,
      metadata: { avg_percentage: accRes.rows[0].avg_pct },
    });
    if (a) awarded.push(a);
  }

  const supporterRes = await pool.query(
    `SELECT e.student_id, COUNT(*)::int AS helps
     FROM class_point_events e
     WHERE e.class_id = $1 AND e.group_id IS NOT NULL AND e.skill = 'helping'
       AND NOT e.undone AND e.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY e.student_id
     HAVING COUNT(*) >= 3
     ORDER BY helps DESC
     LIMIT 1`,
    [classId]
  );
  if (supporterRes.rows[0]) {
    const a = await grantAchievement({
      studentId: supporterRes.rows[0].student_id,
      classId,
      groupId: groupId || null,
      titleKey: 'team_supporter',
      periodKey: weekKey,
      metadata: { help_count: supporterRes.rows[0].helps },
    });
    if (a) awarded.push(a);
  }

  const legendRes = await pool.query(
    `SELECT qa.student_id,
            ROUND(AVG(qa.score::numeric / NULLIF(qa.total, 0)) * 100)::int AS avg_pct,
            COUNT(*)::int AS attempts
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     WHERE q.class_id = $1 AND qa.attempted_at >= NOW() - INTERVAL '30 days'
       AND COALESCE(qa.is_guest, FALSE) = FALSE
     GROUP BY qa.student_id
     HAVING COUNT(*) >= 3
     ORDER BY avg_pct DESC
     LIMIT 1`,
    [classId]
  );
  if (legendRes.rows[0] && legendRes.rows[0].avg_pct >= 85) {
    const a = await grantAchievement({
      studentId: legendRes.rows[0].student_id,
      classId,
      groupId,
      titleKey: 'class_legend',
      periodKey: monthK,
      metadata: {
        avg_percentage: legendRes.rows[0].avg_pct,
        attempts: legendRes.rows[0].attempts,
      },
    });
    if (a) awarded.push(a);
  }

  return awarded.filter(Boolean);
}

async function getDisplayedTitle(studentId, classId) {
  const r = await pool.query(
    `SELECT d.title_key, a.earned_at
     FROM student_displayed_titles d
     JOIN student_achievements a
       ON a.student_id = d.student_id AND a.class_id = d.class_id AND a.title_key = d.title_key
     WHERE d.student_id = $1 AND d.class_id = $2
     LIMIT 1`,
    [studentId, classId]
  );
  if (!r.rows.length) return null;
  const meta = titleMeta(r.rows[0].title_key);
  return meta ? { ...meta, title_key: r.rows[0].title_key, earned_at: r.rows[0].earned_at } : null;
}

async function setDisplayedTitle(studentId, classId, titleKey) {
  const owned = await pool.query(
    `SELECT 1 FROM student_achievements
     WHERE student_id = $1 AND class_id = $2 AND title_key = $3 LIMIT 1`,
    [studentId, classId, titleKey]
  );
  if (!owned.rows.length) {
    const err = new Error('You have not earned this title yet.');
    err.status = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO student_displayed_titles (student_id, class_id, title_key, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (student_id, class_id) DO UPDATE SET title_key = EXCLUDED.title_key, updated_at = NOW()`,
    [studentId, classId, titleKey]
  );
  return getDisplayedTitle(studentId, classId);
}

async function getDisplayedTitlesForStudents(classId, studentIds) {
  if (!studentIds?.length) return {};
  const r = await pool.query(
    `SELECT d.student_id, d.title_key
     FROM student_displayed_titles d
     JOIN student_achievements a
       ON a.student_id = d.student_id AND a.class_id = d.class_id AND a.title_key = d.title_key
     WHERE d.class_id = $1 AND d.student_id = ANY($2::int[])`,
    [classId, studentIds]
  );
  const map = {};
  for (const row of r.rows) {
    const meta = titleMeta(row.title_key);
    if (meta) map[row.student_id] = { ...meta, title_key: row.title_key };
  }
  return map;
}

async function listStudentAchievements(studentId, classId) {
  const rows = await pool.query(
    `SELECT * FROM student_achievements
     WHERE student_id = $1 AND class_id = $2
     ORDER BY earned_at DESC`,
    [studentId, classId]
  );
  const displayed = await getDisplayedTitle(studentId, classId);
  return {
    achievements: rows.rows.map((row) => ({
      id: row.id,
      title_key: row.title_key,
      earned_at: row.earned_at,
      period_key: row.period_key,
      metadata: row.metadata || {},
      ...titleMeta(row.title_key),
    })),
    displayed_title: displayed,
  };
}

module.exports = {
  isoWeekKey,
  monthKey,
  grantAchievement,
  evaluateQuizSubmit,
  refreshWeeklyTitles,
  getDisplayedTitle,
  getDisplayedTitlesForStudents,
  setDisplayedTitle,
  listStudentAchievements,
  getStudentName,
};
