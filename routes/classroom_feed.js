const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanAccessClass, userCanManageClass, isClassMember } = require('../lib/classAccess');
const { feedUploadMiddleware } = require('../lib/feedUpload');
const { ensureFeedTables } = require('../lib/feedSchema');
const { notifyClassAudiencePush } = require('../lib/classContentNotify');
const { insertUserNotification } = require('../lib/classMomentNotify');
const { sendMail } = require('../lib/optionalMailer');

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
    const pending = await pool.query(
      `SELECT i.id, u.id AS teacher_id, u.name, u.email, i.created_at
       FROM class_co_teacher_invites i
       JOIN users u ON u.id = i.teacher_id
       WHERE i.class_id = $1 AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [classId]
    );
    res.json({ teachers: result.rows, pending: pending.rows });
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

// ── Co-teacher invitation flow (invite → in-app notification → accept) ─────

// GET my pending co-teacher invites
router.get('/co-teacher-invites/mine', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT i.id, i.class_id, i.created_at, c.name AS class_name, c.subject AS class_subject,
              u.name AS inviter_name, u.email AS inviter_email
       FROM class_co_teacher_invites i
       JOIN classes c ON c.id = i.class_id
       LEFT JOIN users u ON u.id = i.inviter_id
       WHERE i.teacher_id = $1 AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.rows);
  } catch (err) {
    console.error('[co-teacher-invites/mine]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Accept an invite → becomes co-teacher + email confirmation
router.post('/co-teacher-invites/:inviteId/accept', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const inv = (await pool.query(
      `SELECT i.*, c.name AS class_name, c.subject AS class_subject, u.name AS inviter_name, u.email AS inviter_email
       FROM class_co_teacher_invites i
       JOIN classes c ON c.id = i.class_id
       LEFT JOIN users u ON u.id = i.inviter_id
       WHERE i.id = $1 AND i.teacher_id = $2 AND i.status = 'pending'`,
      [req.params.inviteId, req.user.id]
    )).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invite not found or already handled.' });

    await pool.query(
      'INSERT INTO class_co_teachers (class_id, teacher_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [inv.class_id, req.user.id]
    );
    await pool.query(`UPDATE class_co_teacher_invites SET status='accepted', responded_at=NOW() WHERE id=$1`, [inv.id]);

    const me = (await pool.query('SELECT name, email FROM users WHERE id=$1', [req.user.id])).rows[0] || {};
    if (inv.inviter_id) await insertUserNotification({
      userId: inv.inviter_id,
      type: 'co_teacher',
      title: '✅ Co-teacher invite accepted',
      body: `${me.name || 'The teacher'} accepted your invite and is now a co-teacher of ${inv.class_name}.`,
      payload: { class_id: inv.class_id },
    }).catch(() => {});

    sendMail({
      to: me.email,
      subject: `You are now a co-teacher of ${inv.class_name} — UClass`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;">
        <h2 style="color:#4f46e5;margin-bottom:8px;">🤝 Welcome aboard, ${me.name || 'teacher'}!</h2>
        <p>You accepted a co-teacher invite${inv.inviter_name ? ` from <strong>${inv.inviter_name}</strong>` : ''}. You are now a co-teacher of:</p>
        <p style="background:#eef2ff;border-radius:10px;padding:12px 16px;font-size:15px;">
          <strong>${inv.class_name}</strong>${inv.class_subject ? ` — ${inv.class_subject}` : ''}
        </p>
        <p><strong>You can now:</strong></p>
        <ul style="color:#334155;line-height:1.8;">
          <li>View the class, its students and their profiles</li>
          <li>Record and view CAT marks and behavior points</li>
          <li>Create and grade quizzes, homework and notes</li>
          <li>Post announcements and classroom moments</li>
          <li>Generate mid-term report cards</li>
        </ul>
        <p style="color:#64748b;font-size:13px;margin-top:20px;">Sign in to UClass — the class now appears in your dashboard.</p>
      </div>`,
      text: `You are now a co-teacher of ${inv.class_name}${inv.class_subject ? ` (${inv.class_subject})` : ''} on UClass. Sign in to view and manage the class.`,
    }).catch(() => {});

    res.json({ ok: true, class_id: inv.class_id, class_name: inv.class_name });
  } catch (err) {
    console.error('[co-teacher-invites/accept]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Decline an invite
router.post('/co-teacher-invites/:inviteId/decline', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const inv = (await pool.query(
      `SELECT i.*, c.name AS class_name, u.name AS my_name FROM class_co_teacher_invites i
       JOIN classes c ON c.id = i.class_id JOIN users u ON u.id = i.teacher_id
       WHERE i.id = $1 AND i.teacher_id = $2 AND i.status = 'pending'`,
      [req.params.inviteId, req.user.id]
    )).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invite not found or already handled.' });
    await pool.query(`UPDATE class_co_teacher_invites SET status='declined', responded_at=NOW() WHERE id=$1`, [inv.id]);
    if (inv.inviter_id) {
      await insertUserNotification({
        userId: inv.inviter_id,
        type: 'co_teacher',
        title: 'Co-teacher invite declined',
        body: `${inv.my_name || 'A teacher'} declined your co-teacher invite for ${inv.class_name}.`,
        payload: { class_id: inv.class_id },
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[co-teacher-invites/decline]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Add co-teacher by email → sends an in-app invitation the teacher must accept
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
    const already = await pool.query('SELECT 1 FROM class_co_teachers WHERE class_id=$1 AND teacher_id=$2', [classId, t.id]);
    if (already.rows.length) return res.status(400).json({ error: `${t.name} is already a co-teacher of this class.` });
    const pendingInv = await pool.query(
      `SELECT 1 FROM class_co_teacher_invites WHERE class_id=$1 AND teacher_id=$2 AND status='pending'`,
      [classId, t.id]
    );
    if (pendingInv.rows.length) return res.status(400).json({ error: `An invite is already pending for ${t.name}.` });

    const inv = await pool.query(
      `INSERT INTO class_co_teacher_invites (class_id, teacher_id, inviter_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (class_id, teacher_id) DO UPDATE SET status='pending', inviter_id=$3, created_at=NOW(), responded_at=NULL
       RETURNING id`,
      [classId, t.id, req.user.id]
    );
    const me = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0] || {};
    const cls = manage.cls;
    await insertUserNotification({
      userId: t.id,
      type: 'co_teacher_invite',
      title: '🤝 Co-teacher invitation',
      body: `${me.name || 'A teacher'} invited you to co-manage "${cls.name}"${cls.subject ? ` (${cls.subject})` : ''}. Accept it from your dashboard.`,
      payload: { invite_id: inv.rows[0].id, class_id: classId, url: '/staff/dashboard' },
    }).catch(() => {});

    res.json({ ok: true, invited: true, teacher: { id: t.id, name: t.name, email: t.email } });
  } catch (err) {
    console.error('[co-teachers/add]', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
