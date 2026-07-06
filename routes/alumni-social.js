const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Ensure feed views table and views_count column exist
pool.query(`
  CREATE TABLE IF NOT EXISTS alumni_feed_views (
    post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_feed_views_post ON alumni_feed_views(post_id);
  ALTER TABLE alumni_feed_posts ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
  ALTER TABLE alumni_feed_posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
  ALTER TABLE alumni_feed_posts ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
  ALTER TABLE alumni_feed_comments ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE alumni_feed_comments ADD COLUMN IF NOT EXISTS content TEXT;
  ALTER TABLE alumni_feed_comments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
  CREATE TABLE IF NOT EXISTS alumni_feed_reactions (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES alumni_feed_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id)
  );
`).catch((e) => console.warn('[alumni-social] schema fix:', e.message.slice(0, 120)));

// Migrate user_id -> author_id in alumni_feed_comments if needed
pool.query(`
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alumni_feed_comments' AND column_name='user_id') THEN
      UPDATE alumni_feed_comments SET author_id = user_id WHERE author_id IS NULL AND user_id IS NOT NULL;
    END IF;
  END $$;
`).catch((e) => console.warn('[alumni-social] migrate comments:', e.message.slice(0, 120)));

function audit(event, details) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
}

// ── ALUMNI GROUPS (U-Class Groups) ─────────────────────────────────────────

// List all groups + membership status for current user
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await pool.query(`
      SELECT g.*,
        EXISTS(SELECT 1 FROM alumni_group_members m WHERE m.group_id=g.id AND m.user_id=$1) as is_member,
        (SELECT COUNT(*) FROM alumni_group_members WHERE group_id=g.id) as member_count
      FROM alumni_groups g
      WHERE g.is_public=TRUE OR EXISTS(SELECT 1 FROM alumni_group_members m WHERE m.group_id=g.id AND m.user_id=$1)
      ORDER BY g.created_at DESC
    `, [req.user.id]);
    res.json(groups.rows);
  } catch (err) {
    console.error('[alumni/groups]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Create a new group
router.post('/groups', authenticateToken, async (req, res) => {
  const { name, description, is_public } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Group name is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO alumni_groups (name, description, creator_id, is_public)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), description || null, req.user.id, is_public !== false]
    );
    const group = result.rows[0];
    await pool.query(
      `INSERT INTO alumni_group_members (group_id, user_id, role) VALUES ($1,$2,'admin')`,
      [group.id, req.user.id]
    );
    audit('alumni_group_created', { user_id: req.user.id, group_id: group.id });
    res.status(201).json(group);
  } catch (err) {
    console.error('[alumni/groups/create]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get single group details + members
router.get('/groups/:id', authenticateToken, async (req, res) => {
  try {
    const group = await pool.query(`SELECT * FROM alumni_groups WHERE id=$1`, [req.params.id]);
    if (group.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    const members = await pool.query(`
      SELECT m.*, u.name, u.email, u.role as user_role
      FROM alumni_group_members m
      JOIN users u ON u.id=m.user_id
      WHERE m.group_id=$1
      ORDER BY m.joined_at
    `, [req.params.id]);
    const isMember = members.rows.some(m => m.user_id === req.user.id);
    if (!group.rows[0].is_public && !isMember) return res.status(403).json({ error: 'Private group.' });
    res.json({ ...group.rows[0], members: members.rows, is_member: isMember });
  } catch (err) {
    console.error('[alumni/groups/id]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Join a group
router.post('/groups/:id/join', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO alumni_group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    await pool.query(`UPDATE alumni_groups SET member_count=(SELECT COUNT(*) FROM alumni_group_members WHERE group_id=$1) WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/groups/join]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Leave a group
router.post('/groups/:id/leave', authenticateToken, async (req, res) => {
  try {
    await pool.query(`DELETE FROM alumni_group_members WHERE group_id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    await pool.query(`UPDATE alumni_groups SET member_count=(SELECT COUNT(*) FROM alumni_group_members WHERE group_id=$1) WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/groups/leave]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GROUP MESSAGES (Chat) ──────────────────────────────────────────────────

// Get messages for a group
router.get('/groups/:id/messages', authenticateToken, async (req, res) => {
  const { before_id } = req.query;
  try {
    const membership = await pool.query(
      `SELECT 1 FROM alumni_group_members WHERE group_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    const group = await pool.query(`SELECT is_public FROM alumni_groups WHERE id=$1`, [req.params.id]);
    if (group.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
    if (!group.rows[0].is_public && membership.rows.length === 0) {
      return res.status(403).json({ error: 'You must join this group to view messages.' });
    }
    let query = `
      SELECT m.*, u.name as sender_name, u.email as sender_email
      FROM alumni_group_messages m
      JOIN users u ON u.id=m.sender_id
      WHERE m.group_id=$1
    `;
    const params = [req.params.id];
    if (before_id) {
      query += ` AND m.id < $2`;
      params.push(before_id);
    }
    query += ` ORDER BY m.created_at DESC LIMIT 50`;
    const messages = await pool.query(query, params);
    res.json(messages.rows.reverse());
  } catch (err) {
    console.error('[alumni/groups/messages]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Send a message
router.post('/groups/:id/messages', authenticateToken, async (req, res) => {
  const { content, image_path, message_type, reply_to_id } = req.body;
  try {
    const membership = await pool.query(
      `SELECT 1 FROM alumni_group_members WHERE group_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (membership.rows.length === 0) return res.status(403).json({ error: 'You must join this group to send messages.' });
    const result = await pool.query(
      `INSERT INTO alumni_group_messages (group_id, sender_id, content, image_path, message_type, reply_to_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, req.user.id, content || null, image_path || null, message_type || 'text', reply_to_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/groups/messages/send]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ALUMNI STORIES ─────────────────────────────────────────────────────────

router.get('/stories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.name as author_name, u.avatar_url,
        EXISTS(SELECT 1 FROM alumni_story_views v WHERE v.story_id=s.id AND v.user_id=$1) as viewed_by_me
       FROM alumni_stories s
       JOIN users u ON u.id=s.user_id
       WHERE s.expires_at > NOW()
       ORDER BY s.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json({ stories: result.rows });
  } catch (err) {
    console.error('[alumni/stories]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/stories', authenticateToken, requireRole('alumni', 'admin', 'head_teacher', 'student'), async (req, res) => {
  const { content, media_url, background_color } = req.body;
  if (!content && !media_url) return res.status(400).json({ error: 'Content or media required.' });
  try {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await pool.query(
      `INSERT INTO alumni_stories (user_id, content, media_url, background_color, expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, content || null, media_url || null, background_color || '#7c3aed', expires]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/stories/create]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/stories/:id/view', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO alumni_story_views (story_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/stories/view]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/stories/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM alumni_stories WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/stories/delete]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ALUMNI FEED ────────────────────────────────────────────────────────────

// Get feed posts
router.get('/feed', authenticateToken, async (req, res) => {
  const { cursor, author_id } = req.query;
  try {
    let query = `
      SELECT p.*, u.name as author_name, u.email as author_email, u.graduation_year,
        s.name as school_name,
        EXISTS(SELECT 1 FROM alumni_feed_likes l WHERE l.post_id=p.id AND l.user_id=$1) as liked_by_me
      FROM alumni_feed_posts p
      JOIN users u ON u.id=p.author_id
      LEFT JOIN schools s ON s.id=u.school_id
    `;
    const params = [req.user.id];
    const filters = [];
    if (cursor) {
      filters.push(`p.id < $${params.length + 1}`);
      params.push(cursor);
    }
    if (author_id) {
      filters.push(`p.author_id = $${params.length + 1}`);
      params.push(author_id);
    }
    if (filters.length) {
      query += ` WHERE ${filters.join(' AND ')}`;
    }
    query += ` ORDER BY p.created_at DESC LIMIT 20`;
    const posts = await pool.query(query, params);
    res.json({ posts: posts.rows });
  } catch (err) {
    console.error('[alumni/feed]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get single feed post with comments (for post detail page)
router.get('/feed/:id', authenticateToken, async (req, res) => {
  try {
    const postRes = await pool.query(
      `SELECT p.*, u.name as author_name, u.email as author_email, u.graduation_year,
        s.name as school_name,
        EXISTS(SELECT 1 FROM alumni_feed_likes l WHERE l.post_id=p.id AND l.user_id=$2) as liked_by_me
       FROM alumni_feed_posts p
       JOIN users u ON u.id=p.author_id
       LEFT JOIN schools s ON s.id=u.school_id
       WHERE p.id=$1`, [req.params.id, req.user.id]
    );
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Post not found.' });
    const post = postRes.rows[0];

    // Track view — insert if not already viewed by this user
    await pool.query(
      `INSERT INTO alumni_feed_views (post_id, user_id) VALUES ($1,$2)
       ON CONFLICT (post_id, user_id) DO UPDATE SET viewed_at=NOW()`,
      [post.id, req.user.id]
    ).catch(() => {});
    // Update views_count
    await pool.query(
      `UPDATE alumni_feed_posts SET views_count=(SELECT COUNT(*) FROM alumni_feed_views WHERE post_id=$1) WHERE id=$1`,
      [post.id]
    ).catch(() => {});
    post.views_count = await pool.query('SELECT COUNT(*)::int AS c FROM alumni_feed_views WHERE post_id=$1', [post.id]).then(r => r.rows[0].c).catch(() => 0);

    const comments = await pool.query(
      `SELECT c.*, u.name as author_name FROM alumni_feed_comments c
       JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json({ post, comments: comments.rows });
  } catch (err) {
    console.error('[alumni/feed/:id]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Create feed post
router.post('/feed', authenticateToken, async (req, res) => {
  const { content, image_paths, post_type } = req.body;
  try {
    // image_paths in DB is TEXT[] — wrap single string in array
    const imgArr = image_paths ? (Array.isArray(image_paths) ? image_paths : [image_paths]) : null;
    const insertRes = await pool.query(
      `INSERT INTO alumni_feed_posts (author_id, content, image_paths, post_type)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, content || null, imgArr, post_type || (imgArr ? 'image' : 'text')]
    );
    const post = insertRes.rows[0];
    const enrichRes = await pool.query(
      `SELECT p.*, u.name as author_name, u.email as author_email, u.graduation_year,
        s.name as school_name
       FROM alumni_feed_posts p
       JOIN users u ON u.id=p.author_id
       LEFT JOIN schools s ON s.id=u.school_id
       WHERE p.id=$1`, [post.id]
    );
    res.status(201).json(enrichRes.rows[0] || post);
  } catch (err) {
    console.error('[alumni/feed/create]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Like a post
router.post('/feed/:id/like', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO alumni_feed_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    await pool.query(`UPDATE alumni_feed_posts SET likes_count=(SELECT COUNT(*) FROM alumni_feed_likes WHERE post_id=$1) WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/feed/like]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Unlike a post
router.delete('/feed/:id/like', authenticateToken, async (req, res) => {
  try {
    await pool.query(`DELETE FROM alumni_feed_likes WHERE post_id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    await pool.query(`UPDATE alumni_feed_posts SET likes_count=(SELECT COUNT(*) FROM alumni_feed_likes WHERE post_id=$1) WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/feed/unlike]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get comments for a post
router.get('/feed/:id/comments', authenticateToken, async (req, res) => {
  try {
    const comments = await pool.query(`
      SELECT c.*, u.name as author_name
      FROM alumni_feed_comments c
      JOIN users u ON u.id=c.author_id
      WHERE c.post_id=$1
      ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json({ comments: comments.rows });
  } catch (err) {
    console.error('[alumni/feed/comments]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Add comment
router.post('/feed/:id/comments', authenticateToken, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required.' });
  try {
    const result = await pool.query(
      `INSERT INTO alumni_feed_comments (post_id, author_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, content.trim()]
    );
    await pool.query(`UPDATE alumni_feed_posts SET comments_count=(SELECT COUNT(*) FROM alumni_feed_comments WHERE post_id=$1) WHERE id=$1`, [req.params.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/feed/comment]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// React to a post (emoji)
router.post('/feed/:id/reaction', authenticateToken, async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji required.' });
  try {
    await pool.query(
      `INSERT INTO alumni_feed_reactions (post_id, user_id, emoji) VALUES ($1,$2,$3)
       ON CONFLICT (post_id, user_id) DO UPDATE SET emoji=EXCLUDED.emoji`,
      [req.params.id, req.user.id, emoji]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/feed/reaction]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Delete own post
router.delete('/feed/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(`DELETE FROM alumni_feed_posts WHERE id=$1 AND author_id=$2`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/feed/delete]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── DIRECT MESSAGES (1-on-1 colleague chat) ────────────────────────────────

// Ensure table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS alumni_direct_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    image_path VARCHAR(500),
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_adm_sender ON alumni_direct_messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_adm_receiver ON alumni_direct_messages(receiver_id);
`).catch(() => {});

// Get conversation between current user and target user
router.get('/direct-messages/:userId', authenticateToken, async (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  try {
    const msgs = await pool.query(
      `SELECT * FROM alumni_direct_messages
       WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
       ORDER BY created_at ASC LIMIT 200`,
      [req.user.id, otherId]
    );
    // Mark received messages as read
    await pool.query(
      `UPDATE alumni_direct_messages SET read_at=NOW() WHERE receiver_id=$1 AND sender_id=$2 AND read_at IS NULL`,
      [req.user.id, otherId]
    );
    res.json({ messages: msgs.rows });
  } catch (err) {
    console.error('[alumni/direct-messages/get]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Send a direct message
router.post('/direct-messages/:userId', authenticateToken, async (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  const { content, image_path } = req.body;
  if (!content?.trim() && !image_path) {
    return res.status(400).json({ error: 'Message content or image required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO alumni_direct_messages (sender_id, receiver_id, content, image_path)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, otherId, content?.trim() || null, image_path || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/direct-messages/send]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
