const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanAccessClass, userCanManageClass, isClassMember } = require('../lib/classAccess');
const { createFeedUpload } = require('../lib/feedUpload');

const router = express.Router();

async function ensureFeedSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classroom_feed_posts (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_type VARCHAR(30) NOT NULL,
      body TEXT,
      media_url TEXT,
      media_mime VARCHAR(100),
      voice_duration_sec INTEGER,
      classwork_summary TEXT,
      repost_of_id INTEGER REFERENCES classroom_feed_posts(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS classroom_feed_likes (
      post_id INTEGER NOT NULL REFERENCES classroom_feed_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS classroom_feed_comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES classroom_feed_posts(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      parent_comment_id INTEGER REFERENCES classroom_feed_comments(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS class_co_teachers (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (class_id, teacher_id)
    );
  `);
  await pool.query(`
    ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id);
  `).catch(() => {});
}

ensureFeedSchema().catch((e) => console.error('[classroom_feed] schema:', e.message));

function parentFeedFilter(userId) {
  return `(
    p.author_id IN (SELECT student_id FROM parent_children WHERE parent_id = $2)
    OR p.author_id IN (SELECT c.teacher_id FROM classes c WHERE c.id = p.class_id)
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = p.author_id AND u.role IN ('teacher', 'head_teacher')
    )
  )`;
}

// GET feed for a class
router.get('/:classId/posts', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const access = await userCanAccessClass(req.user, classId);
  if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

  try {
    let where = 'p.class_id = $1';
    const params = [classId];

    if (req.user.role === 'parent') {
      where += ` AND ${parentFeedFilter(req.user.id)}`;
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
    console.error('[feed list]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create post (text or multipart with media)
router.post('/:classId/posts', authenticateToken, createFeedUpload('file'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const access = await userCanAccessClass(req.user, classId);
  if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });

  const postType = (req.body.post_type || 'text').trim();
  const body = (req.body.body || '').trim();
  const classworkSummary = (req.body.classwork_summary || '').trim() || null;
  const voiceDuration = req.body.voice_duration_sec ? parseInt(req.body.voice_duration_sec, 10) : null;
  const repostOfId = req.body.repost_of_id ? parseInt(req.body.repost_of_id, 10) : null;

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
  }

  if (postType !== 'text' && !mediaUrl && !body) {
    return res.status(400).json({ error: 'Add text or upload a file.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO classroom_feed_posts
        (class_id, author_id, post_type, body, media_url, media_mime, voice_duration_sec, classwork_summary, repost_of_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [classId, req.user.id, postType, body || null, mediaUrl, mediaMime, voiceDuration, classworkSummary, repostOfId]
    );
    const row = result.rows[0];
    const author = await pool.query('SELECT name, role FROM users WHERE id=$1', [req.user.id]);
    res.status(201).json({
      ...row,
      author_name: author.rows[0]?.name,
      author_role: author.rows[0]?.role,
      like_count: 0,
      comment_count: 0,
      liked_by_me: false,
    });
  } catch (err) {
    console.error('[feed post]', err);
    res.status(500).json({ error: 'Internal server error.' });
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
