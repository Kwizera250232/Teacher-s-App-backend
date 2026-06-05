const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const { titleMeta } = require('../lib/achievementCatalog');
const {
  getDisplayedTitle,
  setDisplayedTitle,
  isoWeekKey,
  monthKey,
} = require('../lib/achievementEngine');

const router = express.Router();

async function studentInClass(classId, studentId) {
  const r = await pool.query(
    'SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2',
    [classId, studentId]
  );
  return r.rows.length > 0;
}

async function studentInGroup(studentId, groupId) {
  const r = await pool.query(
    'SELECT 1 FROM class_group_members WHERE group_id = $1 AND student_id = $2',
    [groupId, studentId]
  );
  return r.rows.length > 0;
}

function mapAchievement(row) {
  const meta = titleMeta(row.title_key);
  return {
    id: row.id,
    title_key: row.title_key,
    earned_at: row.earned_at,
    period_key: row.period_key,
    metadata: row.metadata || {},
    group_id: row.group_id,
    ...meta,
  };
}

// GET my earned titles in class
router.get('/:classId/achievements/mine', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  try {
    if (!(await studentInClass(classId, req.user.id))) {
      return res.status(403).json({ error: 'Not in this class.' });
    }
    const rows = await pool.query(
      `SELECT * FROM student_achievements
       WHERE student_id = $1 AND class_id = $2
       ORDER BY earned_at DESC`,
      [req.user.id, classId]
    );
    const displayed = await getDisplayedTitle(req.user.id, classId);
    res.json({
      achievements: rows.rows.map(mapAchievement),
      displayed_title: displayed,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT select crown title to display (visible outside group)
router.put('/:classId/achievements/displayed-title', authenticateToken, requireRole('student'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const titleKey = String(req.body?.title_key || '').trim();
  if (!titleKey) return res.status(400).json({ error: 'title_key is required.' });
  try {
    if (!(await studentInClass(classId, req.user.id))) {
      return res.status(403).json({ error: 'Not in this class.' });
    }
    const displayed = await setDisplayedTitle(req.user.id, classId, titleKey);
    res.json({ displayed_title: displayed });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
  }
});

// GET achievement feed + hall of fame inside a group
router.get('/:classId/groups/:groupId/achievements', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const groupId = parseInt(req.params.groupId, 10);
  try {
    const isTeacher = ['teacher', 'head_teacher'].includes(req.user.role);
    if (!isTeacher) {
      if (!(await studentInClass(classId, req.user.id))) {
        return res.status(403).json({ error: 'Not in this class.' });
      }
      if (!(await studentInGroup(req.user.id, groupId))) {
        return res.status(403).json({ error: 'You are not in this group.' });
      }
    } else {
      const manage = await userCanManageClass(req.user, classId);
      if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });
    }

    const weekKey = isoWeekKey();
    const monthK = monthKey();

    const feed = await pool.query(
      `SELECT f.*, u.name AS student_name,
              (SELECT jsonb_object_agg(r.reaction_type, cnt)
               FROM (
                 SELECT reaction_type, COUNT(*)::int AS cnt
                 FROM achievement_reactions
                 WHERE feed_id = f.id
                 GROUP BY reaction_type
               ) r) AS reaction_counts,
              (SELECT COALESCE(jsonb_agg(reaction_type), '[]'::jsonb)
               FROM achievement_reactions
               WHERE feed_id = f.id AND user_id = $3) AS my_reactions
       FROM achievement_feed f
       JOIN users u ON u.id = f.student_id
       WHERE f.class_id = $1 AND (f.group_id = $2 OR f.group_id IS NULL)
       ORDER BY f.created_at DESC
       LIMIT 40`,
      [classId, groupId, req.user.id]
    );

    const hallWeek = await pool.query(
      `SELECT a.student_id, u.name AS student_name, a.title_key, a.metadata, a.earned_at,
              g.name AS group_name
       FROM student_achievements a
       JOIN users u ON u.id = a.student_id
       LEFT JOIN class_groups g ON g.id = a.group_id
       WHERE a.class_id = $1 AND a.period_key = $2
       ORDER BY a.earned_at DESC
       LIMIT 10`,
      [classId, weekKey]
    );

    const hallMonth = await pool.query(
      `SELECT a.student_id, u.name AS student_name, a.title_key, a.metadata, a.earned_at,
              g.name AS group_name
       FROM student_achievements a
       JOIN users u ON u.id = a.student_id
       LEFT JOIN class_groups g ON g.id = a.group_id
       WHERE a.class_id = $1 AND a.period_key = $2
       ORDER BY a.earned_at DESC
       LIMIT 10`,
      [classId, monthK]
    );

    const teamAchievements = await pool.query(
      `SELECT a.*, u.name AS student_name
       FROM student_achievements a
       JOIN users u ON u.id = a.student_id
       WHERE a.class_id = $1 AND a.group_id = $2
       ORDER BY a.earned_at DESC
       LIMIT 30`,
      [classId, groupId]
    );

    res.json({
      feed: feed.rows.map((row) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: row.student_name,
        title_key: row.title_key,
        title: titleMeta(row.title_key),
        headline: row.headline,
        metadata: row.metadata || {},
        created_at: row.created_at,
        reaction_counts: row.reaction_counts || {},
        my_reactions: row.my_reactions || [],
      })),
      hall_of_fame: {
        weekly: hallWeek.rows.map((r) => ({ ...r, title: titleMeta(r.title_key) })),
        monthly: hallMonth.rows.map((r) => ({ ...r, title: titleMeta(r.title_key) })),
      },
      team_achievements: teamAchievements.rows.map((r) => ({
        ...mapAchievement(r),
        student_name: r.student_name,
      })),
    });
  } catch (err) {
    console.error('[group achievements]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST react to feed item
router.post('/:classId/achievements/feed/:feedId/react', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const feedId = parseInt(req.params.feedId, 10);
  const reactionType = String(req.body?.reaction || req.body?.reaction_type || '').trim();
  const allowed = ['applaud', 'congratulate', 'celebrate'];
  if (!allowed.includes(reactionType)) {
    return res.status(400).json({ error: 'reaction must be applaud, congratulate, or celebrate.' });
  }
  try {
    const feed = await pool.query(
      'SELECT * FROM achievement_feed WHERE id = $1 AND class_id = $2',
      [feedId, classId]
    );
    if (!feed.rows.length) return res.status(404).json({ error: 'Not found.' });

    if (req.user.role === 'student') {
      if (!(await studentInClass(classId, req.user.id))) {
        return res.status(403).json({ error: 'Not in this class.' });
      }
      if (feed.rows[0].group_id) {
        if (!(await studentInGroup(req.user.id, feed.rows[0].group_id))) {
          return res.status(403).json({ error: 'Reactions are for your team feed.' });
        }
      }
    }

    await pool.query(
      `INSERT INTO achievement_reactions (feed_id, user_id, reaction_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (feed_id, user_id, reaction_type) DO NOTHING`,
      [feedId, req.user.id, reactionType]
    );

    const counts = await pool.query(
      `SELECT reaction_type, COUNT(*)::int AS cnt
       FROM achievement_reactions WHERE feed_id = $1 GROUP BY reaction_type`,
      [feedId]
    );
    const map = {};
    for (const row of counts.rows) map[row.reaction_type] = row.cnt;
    res.json({ ok: true, reaction_counts: map });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET displayed titles for leaderboard (class members)
router.get('/:classId/achievements/displayed', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  try {
    const rows = await pool.query(
      `SELECT d.student_id, d.title_key, a.earned_at
       FROM student_displayed_titles d
       JOIN student_achievements a
         ON a.student_id = d.student_id AND a.class_id = d.class_id AND a.title_key = d.title_key
       WHERE d.class_id = $1`,
      [classId]
    );
    const map = {};
    for (const row of rows.rows) {
      const meta = titleMeta(row.title_key);
      if (meta) {
        map[row.student_id] = { ...meta, title_key: row.title_key };
      }
    }
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
