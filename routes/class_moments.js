const express = require('express');
const path = require('path');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { userCanManageClass, userCanAccessClass } = require('../lib/classAccess');
const { ensureClassMomentsSchema } = require('../lib/classMomentsSchema');
const { momentPhotosMiddleware } = require('../lib/momentUpload');
const { notifyClassMomentPublished } = require('../lib/classMomentNotify');
const {
  attachReactionsToMoments,
  setMomentReaction,
  momentIdNum,
} = require('../lib/classMomentReactions');

const REACT_ROLES = new Set(['student', 'teacher', 'head_teacher', 'parent', 'admin']);

const router = express.Router();

ensureClassMomentsSchema().catch((e) => console.error('[class_moments] schema:', e.message));

function momentSelectSql(extraWhere = '', extraParams = []) {
  return {
    sql: `
      SELECT m.*,
             u.name AS teacher_name,
             u.email AS teacher_email,
             p.avatar_path AS teacher_avatar_path,
             c.name AS class_name,
             COALESCE(
               (SELECT json_agg(json_build_object(
                 'id', i.id,
                 'file_path', i.file_path,
                 'sort_order', i.sort_order
               ) ORDER BY i.sort_order, i.id)
                FROM class_moment_images i WHERE i.moment_id = m.id),
               '[]'::json
             ) AS images
      FROM class_moments m
      JOIN users u ON u.id = m.teacher_id
      JOIN classes c ON c.id = m.class_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      ${extraWhere}
      ORDER BY m.published_at DESC
    `,
    params: extraParams,
  };
}

async function classIdsForUser(user) {
  if (user.role === 'admin') {
    const r = await pool.query('SELECT id FROM classes');
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'student') {
    const r = await pool.query(
      'SELECT class_id AS id FROM class_members WHERE student_id = $1',
      [user.id]
    );
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'parent') {
    const r = await pool.query(
      `SELECT DISTINCT cm.class_id AS id
       FROM parent_children pc
       JOIN class_members cm ON cm.student_id = pc.student_id
       WHERE pc.parent_id = $1`,
      [user.id]
    );
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'teacher') {
    const r = await pool.query(
      `SELECT id FROM classes WHERE teacher_id = $1
       UNION SELECT class_id AS id FROM class_co_teachers WHERE teacher_id = $1`,
      [user.id]
    );
    return r.rows.map((x) => x.id);
  }
  if (user.role === 'head_teacher' && user.school_id) {
    const r = await pool.query(
      `SELECT c.id FROM classes c
       JOIN users u ON u.id = c.teacher_id
       WHERE u.school_id = $1`,
      [user.school_id]
    );
    return r.rows.map((x) => x.id);
  }
  return [];
}

/** GET featured preview for home cards */
router.get('/preview', authenticateToken, async (req, res) => {
  try {
    const classIds = await classIdsForUser(req.user);
    if (!classIds.length) {
      return res.json({ today_count: 0, latest: null, unread: 0 });
    }
    const today = await pool.query(
      `SELECT COUNT(*)::int AS n FROM class_moments
       WHERE class_id = ANY($1::int[])
         AND published_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [classIds]
    );
    const latestQ = momentSelectSql(
      'WHERE m.class_id = ANY($1::int[])',
      [classIds]
    );
    const latest = await pool.query(`${latestQ.sql} LIMIT 1`, [classIds]);

    let unread = 0;
    if (req.user.role === 'student') {
      const ur = await pool.query(
        `SELECT COUNT(*)::int AS n FROM class_moments m
         WHERE m.class_id = ANY($1::int[])
           AND NOT EXISTS (
             SELECT 1 FROM class_moment_reads r
             WHERE r.moment_id = m.id AND r.user_id = $2
           )`,
        [classIds, req.user.id]
      );
      unread = ur.rows[0]?.n || 0;
    } else if (req.user.role === 'parent') {
      const ur = await pool.query(
        `SELECT COUNT(*)::int AS n FROM parent_notifications
         WHERE parent_id = $1 AND type = 'class_moment' AND is_read = FALSE`,
        [req.user.id]
      );
      unread = ur.rows[0]?.n || 0;
    }

    res.json({
      today_count: today.rows[0]?.n || 0,
      latest: latest.rows[0] || null,
      unread,
    });
  } catch (err) {
    console.error('[class_moments/preview]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET feed (student / parent / staff read) */
router.get('/feed', authenticateToken, async (req, res) => {
  try {
    let classIds = await classIdsForUser(req.user);
    if (!classIds.length) return res.json([]);

    const filterClassId = parseInt(req.query.class_id, 10);
    if (filterClassId && classIds.includes(filterClassId)) {
      classIds = [filterClassId];
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 80);
    const q = momentSelectSql('WHERE m.class_id = ANY($1::int[])', [classIds]);
    const rows = await pool.query(`${q.sql} LIMIT ${limit}`, [classIds]);
    const withReactions = await attachReactionsToMoments(rows.rows, req.user.id);
    res.json(withReactions);
  } catch (err) {
    console.error('[class_moments/feed]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST like / emoji reaction (all roles with class access) */
router.post('/:id/react', authenticateToken, async (req, res) => {
  const momentId = momentIdNum(req.params.id);
  if (!momentId) return res.status(400).json({ error: 'Invalid moment.' });
  if (!REACT_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'Reactions are not available for your account.' });
  }
  try {
    await ensureClassMomentsSchema();
    const row = await pool.query('SELECT id, class_id FROM class_moments WHERE id = $1', [momentId]);
    if (!row.rows.length) return res.status(404).json({ error: 'Not found.' });
    const moment = row.rows[0];
    const access = await userCanAccessClass(req.user, moment.class_id);
    if (!access.ok && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const result = await setMomentReaction({
      momentId,
      userId: req.user.id,
      emoji: req.body?.emoji,
    });
    const [enriched] = await attachReactionsToMoments([{ id: momentId }], req.user.id);
    res.json({ ...result, reactions: enriched?.reactions || { counts: {}, mine: null, people: [], total: 0 } });
  } catch (err) {
    console.error('[class_moments/react]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  const momentId = parseInt(req.params.id, 10);
  if (!momentId) return res.status(400).json({ error: 'Invalid moment.' });
  try {
    const q = momentSelectSql('WHERE m.id = $1', [momentId]);
    const row = await pool.query(q.sql, [momentId]);
    if (!row.rows.length) return res.status(404).json({ error: 'Not found.' });
    const moment = row.rows[0];
    const access = await userCanAccessClass(req.user, moment.class_id);
    if (!access.ok && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    if (req.user.role === 'student') {
      await pool.query(
        `INSERT INTO class_moment_reads (user_id, moment_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [req.user.id, momentId]
      );
    }
    const [enriched] = await attachReactionsToMoments([moment], req.user.id);
    res.json(enriched);
  } catch (err) {
    console.error('[class_moments/get]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST publish moment (teacher / HT / admin) */
router.post('/', authenticateToken, momentPhotosMiddleware(), async (req, res) => {
  try {
    const classId = parseInt(req.body.class_id, 10);
    const description = String(req.body.description || '').trim();
    if (!classId) return res.status(400).json({ error: 'Select a class.' });
    if (!description || description.length < 3) {
      return res.status(400).json({ error: 'Write a short description (at least 3 characters).' });
    }
    if (description.length > 2000) {
      return res.status(400).json({ error: 'Description is too long.' });
    }

    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only post to classes you teach.' });
    }

    const ins = await pool.query(
      `INSERT INTO class_moments (class_id, teacher_id, description)
       VALUES ($1,$2,$3) RETURNING *`,
      [classId, req.user.id, description]
    );
    const moment = ins.rows[0];
    const files = req.files || [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const rel = path.join('moments', path.basename(f.path)).replace(/\\/g, '/');
      await pool.query(
        `INSERT INTO class_moment_images (moment_id, file_path, sort_order) VALUES ($1,$2,$3)`,
        [moment.id, rel, i]
      );
    }

    const imageRows = files.map((f, i) => ({
      id: null,
      file_path: path.join('moments', path.basename(f.path)).replace(/\\/g, '/'),
      sort_order: i,
    }));

    const teacherRow = await pool.query(
      `SELECT u.name, p.avatar_path
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    const teacherMeta = teacherRow.rows[0] || {};

    const published = {
      ...moment,
      teacher_name: teacherMeta.name || 'Teacher',
      class_name: manage.cls?.name || '',
      teacher_avatar_path: teacherMeta.avatar_path || null,
      images: imageRows,
    };

    const [withReactions] = await attachReactionsToMoments([published], req.user.id);
    res.status(201).json({
      moment: withReactions,
      notified: { queued: true },
    });

    const teacherId = req.user.id;
    const className = manage.cls?.name;
    setImmediate(async () => {
      try {
        await notifyClassMomentPublished({
          momentId: moment.id,
          classId,
          teacherId,
          className,
        });
      } catch (notifyErr) {
        console.error('[class_moments/notify]', notifyErr);
      }
    });
  } catch (err) {
    console.error('[class_moments/post]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  const momentId = parseInt(req.params.id, 10);
  if (!momentId) return res.status(400).json({ error: 'Invalid moment.' });
  try {
    const row = await pool.query('SELECT * FROM class_moments WHERE id = $1', [momentId]);
    if (!row.rows.length) return res.status(404).json({ error: 'Not found.' });
    const moment = row.rows[0];
    const manage = await userCanManageClass(req.user, moment.class_id);
    if (!manage.ok && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    await pool.query('DELETE FROM class_moments WHERE id = $1', [momentId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[class_moments/delete]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
