const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanAccessClass, userCanManageClass, isClassMember } = require('../lib/classAccess');
const { feedUploadMiddleware } = require('../lib/feedUpload');
const { ensureFeedTables } = require('../lib/feedSchema');
const { notifyClassAudiencePush } = require('../lib/classContentNotify');

const router = express.Router();

pool.query(`
  ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id);
`).catch(() => {});

/** Parents only see posts their linked child authored (not whole-class teacher feed). */
function parentFeedFilter() {
  return `(
    p.author_id IN (
      SELECT pc.student_id FROM parent_children pc
      JOIN class_members cm ON cm.student_id = pc.student_id AND cm.class_id = p.class_id
      WHERE pc.parent_id = $2
    )
  )`;
}

// GET aggregated home feed for student (all joined classes)
router.get('/my/home', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Student home feed only.' });
  }
  try {
    await ensureFeedTables();
    const classes = await pool.query(
      `SELECT c.id, c.name FROM classes c
       JOIN class_members cm ON cm.class_id = c.id
       WHERE cm.student_id = $1`,
      [req.user.id]
    );
    const all = [];
    for (const cls of classes.rows) {
      const posts = await pool.query(
        `SELECT p.*, u.name AS author_name, u.role AS author_role, c.name AS class_name,
                (SELECT COUNT(*)::int FROM classroom_feed_likes l WHERE l.post_id = p.id) AS like_count,
                (SELECT COUNT(*)::int FROM classroom_feed_comments cm WHERE cm.post_id = p.id) AS comment_count,
                EXISTS(SELECT 1 FROM classroom_feed_likes l2 WHERE l2.post_id = p.id AND l2.user_id = $2) AS liked_by_me
         FROM classroom_feed_posts p
         JOIN users u ON u.id = p.author_id
         JOIN classes c ON c.id = p.class_id
         WHERE p.class_id = $1
         ORDER BY p.created_at DESC
         LIMIT 40`,
        [cls.id, req.user.id]
      );
      all.push(...posts.rows);
    }
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(all.slice(0, 80));
  } catch (err) {
    console.error('[feed home]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET feed for a class
router.get('/:classId/posts', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const access = await userCanAccessClass(req.user, classId);
  if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

  try {
    await ensureFeedTables();
    let where = 'p.class_id = $1';
    const params = [classId];

    if (req.user.role === 'parent') {
      where += ` AND ${parentFeedFilter()}`;
      params.push(req.user.id);
    }

    const posts = await pool.query(
      `SELECT p.*, u.name AS author_name, u.role AS author_role,
              (SELECT COUNT(*)::int FROM classroom_feed_likes l WHERE l.post_id = p.id) AS like_count,
              (SELECT COUNT(*)::int FROM classroom_feed_comments c WHERE c.post_id = p.id) AS comment_count,
              EXISTS(SELECT 1 FROM classroom_feed_likes l2 WHERE l2.post_id = p.id AND l2.user_id = $${params.length + 1}) AS liked_by_me
       FROM classroom_feed_posts p
       JOIN users u ON u.id = p.author_id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [...params, req.user.id]
    );
    res.json(posts.rows);
  } catch (err) {
    console.error('[feed list]', err.message, err.code, err.detail);
    const msg = err.code === '42P01'
      ? 'Feed is being set up. Refresh in a few seconds.'
      : 'Internal server error.';
    res.status(500).json({ error: msg });
  }
});

// POST create post (text or multipart with media)
router.post('/:classId/posts', authenticateToken, feedUploadMiddleware('file'), async (req, res) => {
  try {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class.' });

  const access = await userCanAccessClass(req.user, classId);
  if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

  const fields = req.body || {};
  let postType = String(fields.post_type || 'text').trim();
  const body = String(fields.body || '').trim();
  const classworkSummary = String(fields.classwork_summary || '').trim() || null;
  const voiceDuration = fields.voice_duration_sec ? parseInt(fields.voice_duration_sec, 10) : null;
  const repostOfId = fields.repost_of_id ? parseInt(fields.repost_of_id, 10) : null;

  const allowedTypes = ['text', 'image', 'document', 'voice', 'drawing', 'exercise', 'activity'];
  if (!allowedTypes.includes(postType)) {
    return res.status(400).json({ error: 'Invalid post type.' });
  }

  if (req.user.role === 'parent') {
    return res.status(403).json({ error: 'Parents can view feed but not post.' });
  }

  if (req.user.role === 'student' && !['text', 'image', 'drawing', 'voice'].includes(postType)) {
    return res.status(403).json({ error: 'Students can post drawings, photos, voice, or text.' });
  }

  if (req.user.role === 'student' && !(await isClassMember(classId, req.user.id))) {
    return res.status(403).json({ error: 'You must be in this class to post.' });
  }

  let mediaUrl = null;
  let mediaMime = null;
  if (req.file) {
    mediaUrl = `/uploads/feed/${req.file.filename}`;
    mediaMime = req.file.mimetype;
    const mime = (mediaMime || '').toLowerCase();
    const requested = String(fields.post_type || 'text').trim();
    if (requested === 'drawing') {
      postType = 'drawing';
    } else if (mime.startsWith('image/')) {
      postType = 'image';
    } else if (mime.startsWith('audio/')) {
      postType = 'voice';
    } else if (postType === 'text') {
      postType = 'document';
    }
  }

  const needsFile = ['image', 'drawing', 'voice', 'document'].includes(postType);
  if (needsFile && !mediaUrl) {
    return res.status(400).json({ error: 'Please attach a photo, drawing, voice note, or document.' });
  }
  if (postType === 'text' && !body && !mediaUrl) {
    return res.status(400).json({ error: 'Write what you learnt or attach a photo.' });
  }

  try {
    await ensureFeedTables();
    const result = await pool.query(
      `INSERT INTO classroom_feed_posts
        (class_id, author_id, post_type, body, media_url, media_mime, voice_duration_sec, classwork_summary, repost_of_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [classId, req.user.id, postType, body || null, mediaUrl, mediaMime, voiceDuration, classworkSummary, repostOfId]
    );
    const row = result.rows[0];
    const author = await pool.query('SELECT name, role FROM users WHERE id=$1', [req.user.id]);
    const authorName = author.rows[0]?.name || 'Someone';
    if (mediaUrl || req.user.role === 'teacher' || req.user.role === 'head_teacher') {
      notifyClassAudiencePush({
        classId,
        excludeUserId: req.user.id,
        title: mediaUrl ? '📎 New class upload' : '💬 New class post',
        body: mediaUrl
          ? `${authorName} shared something new in your class feed.`
          : `${authorName}: ${(body || 'New post').slice(0, 120)}`,
        contentType: 'feed',
        tag: `feed-${row.id}`,
      }).catch(() => {});
    }
    res.status(201).json({
      ...row,
      author_name: author.rows[0]?.name,
      author_role: author.rows[0]?.role,
      like_count: 0,
      comment_count: 0,
      liked_by_me: false,
    });
  } catch (err) {
    console.error('[feed post]', err.message, err.code, err.detail, err.stack);
    const msg = err.code === '42P01'
      ? 'Feed is being set up. Wait a moment and try again.'
      : (err.message || 'Could not save post. Try again.');
    res.status(500).json({ error: msg });
  }
  } catch (err) {
    console.error('[feed post outer]', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});

// POST like toggle
router.post('/:classId/posts/:postId/like', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const postId = parseInt(req.params.postId, 10);
  const access = await userCanAccessClass(req.user, classId);
  if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });
  if (req.user.role === 'parent') return res.status(403).json({ error: 'Parents cannot like posts.' });

  try {
    const post = await pool.query('SELECT id FROM classroom_feed_posts WHERE id=$1 AND class_id=$2', [postId, classId]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post not found.' });

    const existing = await pool.query(
      'SELECT 1 FROM classroom_feed_likes WHERE post_id=$1 AND user_id=$2',
      [postId, req.user.id]
    );
    if (existing.rows.length) {
      await pool.query('DELETE FROM classroom_feed_likes WHERE post_id=$1 AND user_id=$2', [postId, req.user.id]);
      return res.json({ liked: false });
    }
    await pool.query('INSERT INTO classroom_feed_likes (post_id, user_id) VALUES ($1,$2)', [postId, req.user.id]);
    res.json({ liked: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET comments
router.get('/:classId/posts/:postId/comments', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const postId = parseInt(req.params.postId, 10);
  const access = await userCanAccessClass(req.user, classId);
  if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS author_name, u.role AS author_role
       FROM classroom_feed_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST comment
router.post('/:classId/posts/:postId/comments', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const postId = parseInt(req.params.postId, 10);
  const body = (req.body.body || '').trim();
  const parentCommentId = req.body.parent_comment_id ? parseInt(req.body.parent_comment_id, 10) : null;
  if (!body) return res.status(400).json({ error: 'Comment text is required.' });

  const access = await userCanAccessClass(req.user, classId);
  if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });
  if (req.user.role === 'parent') return res.status(403).json({ error: 'Parents cannot comment.' });

  try {
    const result = await pool.query(
      `INSERT INTO classroom_feed_comments (post_id, author_id, body, parent_comment_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [postId, req.user.id, body, parentCommentId]
    );
    const author = await pool.query('SELECT name, role FROM users WHERE id=$1', [req.user.id]);
    res.status(201).json({
      ...result.rows[0],
      author_name: author.rows[0]?.name,
      author_role: author.rows[0]?.role,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH own post
router.patch('/:classId/posts/:postId', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const postId = parseInt(req.params.postId, 10);
  const body = (req.body.body || '').trim();
  const classworkSummary = (req.body.classwork_summary || '').trim() || null;

  try {
    const post = await pool.query('SELECT * FROM classroom_feed_posts WHERE id=$1 AND class_id=$2', [postId, classId]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post not found.' });
    const row = post.rows[0];
    const manage = await userCanManageClass(req.user, classId);
    if (row.author_id !== req.user.id && !manage.ok) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const result = await pool.query(
      `UPDATE classroom_feed_posts SET body=COALESCE(NULLIF($1,''), body), classwork_summary=COALESCE($2, classwork_summary)
       WHERE id=$3 RETURNING *`,
      [body, classworkSummary, postId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE own post (or teacher manages class)
router.delete('/:classId/posts/:postId', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const postId = parseInt(req.params.postId, 10);
  try {
    const post = await pool.query('SELECT author_id FROM classroom_feed_posts WHERE id=$1 AND class_id=$2', [postId, classId]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post not found.' });
    const manage = await userCanManageClass(req.user, classId);
    if (post.rows[0].author_id !== req.user.id && !manage.ok) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    await pool.query('DELETE FROM classroom_feed_posts WHERE id=$1', [postId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Co-teacher: list
router.get('/:classId/co-teachers', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, ct.added_at
       FROM class_co_teachers ct
       JOIN users u ON u.id = ct.teacher_id
       WHERE ct.class_id = $1`,
      [classId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Co-teacher invite link
router.post('/:classId/co-teacher-link', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const crypto = require('crypto');
  const classId = parseInt(req.params.classId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  try {
    const cls = manage.cls;
    const schoolRes = await pool.query('SELECT school_id FROM users WHERE id=$1', [cls.teacher_id]);
    const schoolId = schoolRes.rows[0]?.school_id || req.user.school_id;
    const token = crypto.randomBytes(22).toString('hex');
    await pool.query(
      `INSERT INTO invite_tokens (token, role, school_id, creator_id, class_id, expires_at)
       VALUES ($1,'teacher',$2,$3,$4,NOW() + INTERVAL '14 days')`,
      [token, schoolId, req.user.id, classId]
    );
    const frontendUrl = process.env.FRONTEND_URL || 'https://student.umunsi.com';
    res.json({ invite_link: `${frontendUrl}/invite?token=${token}` });
  } catch (err) {
    console.error('[co-teacher-link]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Add co-teacher by email
router.post('/:classId/co-teachers', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  try {
    const teacher = await pool.query(
      `SELECT id, name, email, school_id FROM users
       WHERE email=$1 AND role IN ('teacher','head_teacher') AND is_approved=TRUE`,
      [email]
    );
    if (!teacher.rows.length) {
      return res.status(404).json({ error: 'No approved teacher found with that email. Send them an invite link instead.' });
    }
    const t = teacher.rows[0];
    if (t.id === manage.cls.teacher_id) {
      return res.status(400).json({ error: 'This teacher already owns the class.' });
    }
    await pool.query(
      'INSERT INTO class_co_teachers (class_id, teacher_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [classId, t.id]
    );
    res.json({ ok: true, teacher: { id: t.id, name: t.name, email: t.email } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
