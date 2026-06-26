const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

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

// ── ALUMNI FEED ────────────────────────────────────────────────────────────

// Get feed posts
router.get('/feed', authenticateToken, async (req, res) => {
  const { cursor } = req.query;
  try {
    let query = `
      SELECT p.*, u.name as author_name, u.email as author_email,
        EXISTS(SELECT 1 FROM alumni_feed_likes l WHERE l.post_id=p.id AND l.user_id=$1) as liked_by_me
      FROM alumni_feed_posts p
      JOIN users u ON u.id=p.author_id
    `;
    const params = [req.user.id];
    if (cursor) {
      query += ` WHERE p.id < $2`;
      params.push(cursor);
    }
    query += ` ORDER BY p.created_at DESC LIMIT 20`;
    const posts = await pool.query(query, params);
    res.json(posts.rows);
  } catch (err) {
    console.error('[alumni/feed]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Create feed post
router.post('/feed', authenticateToken, async (req, res) => {
  const { content, image_paths, post_type } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO alumni_feed_posts (author_id, content, image_paths, post_type)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, content || null, image_paths || null, post_type || 'text']
    );
    res.status(201).json(result.rows[0]);
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
    res.json(comments.rows);
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

module.exports = router;
