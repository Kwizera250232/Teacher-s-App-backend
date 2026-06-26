const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

function audit(event, details) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').substring(0, 200);
}

function estimateReadMinutes(content) {
  return Math.max(1, Math.round(stripHtml(content).split(/\s+/).length / 200));
}

// ── Compositions (Student Essays / Articles) ─────────────────────────────────

router.get('/compositions', authenticateToken, async (req, res) => {
  const { author_id, search, category, tag, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const conditions = ["c.status='published'"];
    const params = [];
    let idx = 1;
    if (author_id) { conditions.push(`c.author_id=$${idx}`); params.push(author_id); idx++; }
    if (category) { conditions.push(`c.category=$${idx}`); params.push(category); idx++; }
    if (tag) { conditions.push(`c.tags @> $${idx}::jsonb`); params.push(JSON.stringify([tag])); idx++; }
    if (search) { conditions.push(`(c.title ILIKE $${idx} OR c.excerpt ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM alumni_compositions c WHERE ${conditions.join(' AND ')}`, params);
    const total = parseInt(countRes.rows[0].count);
    params.push(parseInt(limit));
    params.push(offset);

    const result = await pool.query(
      `SELECT c.*, u.name AS author_name, ap.username AS author_username, ap.cover_photo_path AS author_avatar
       FROM alumni_compositions c JOIN users u ON u.id=c.author_id
       LEFT JOIN alumni_profiles ap ON ap.user_id=c.author_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.published_at DESC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    res.json({ compositions: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[alumni/compositions]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/compositions/:slug', authenticateToken, async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS author_name, ap.username AS author_username, ap.cover_photo_path AS author_avatar
       FROM alumni_compositions c JOIN users u ON u.id=c.author_id
       LEFT JOIN alumni_profiles ap ON ap.user_id=c.author_id
       WHERE c.slug=$1 AND (c.status='published' OR c.author_id=$2 OR $3 IN ('admin','head_teacher'))`,
      [slug, req.user.id, req.user.role]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Composition not found.' });
    const comp = result.rows[0];
    if (comp.author_id !== req.user.id) {
      await pool.query(`UPDATE alumni_compositions SET read_count=read_count+1 WHERE id=$1`, [comp.id]);
      comp.read_count += 1;
    }
    const bm = await pool.query(`SELECT 1 FROM alumni_composition_bookmarks WHERE composition_id=$1 AND user_id=$2`, [comp.id, req.user.id]);
    comp.is_bookmarked = bm.rows.length > 0;
    const rx = await pool.query(`SELECT reaction_type FROM alumni_composition_reactions WHERE composition_id=$1 AND user_id=$2`, [comp.id, req.user.id]);
    comp.user_reaction = rx.rows[0]?.reaction_type || null;
    res.json(comp);
  } catch (err) {
    console.error('[alumni/compositions/:slug]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/compositions', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  const { title, content, featured_image_path, category, tags, status = 'draft' } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required.' });
  const slug = slugify(title);
  const excerpt = stripHtml(content);
  const readMin = estimateReadMinutes(content);
  try {
    const result = await pool.query(
      `INSERT INTO alumni_compositions (author_id, title, slug, excerpt, content, featured_image_path, category, tags, status, estimated_read_minutes${status === 'published' ? ', published_at' : ''})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10${status === 'published' ? ',NOW()' : ''}) RETURNING *`,
      [req.user.id, title, slug, excerpt, content, featured_image_path || null, category || null, JSON.stringify(tags || []), status, readMin]
    );
    if (status === 'published') {
      await pool.query(`UPDATE alumni_profiles SET total_compositions=total_compositions+1 WHERE user_id=$1`, [req.user.id]);
    }
    audit('composition_create', { user_id: req.user.id, composition_id: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/compositions POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/compositions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, content, featured_image_path, category, tags, status } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM alumni_compositions WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Composition not found.' });
    const comp = existing.rows[0];
    if (comp.author_id !== req.user.id && !['admin','head_teacher'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const updates = [];
    const params = [];
    let idx = 1;
    if (title !== undefined) { updates.push(`title=$${idx}`); params.push(title); idx++; }
    if (content !== undefined) { updates.push(`content=$${idx}`); params.push(content); idx++; updates.push(`excerpt=$${idx}`); params.push(stripHtml(content)); idx++; updates.push(`estimated_read_minutes=$${idx}`); params.push(estimateReadMinutes(content)); idx++; }
    if (featured_image_path !== undefined) { updates.push(`featured_image_path=$${idx}`); params.push(featured_image_path); idx++; }
    if (category !== undefined) { updates.push(`category=$${idx}`); params.push(category); idx++; }
    if (tags !== undefined) { updates.push(`tags=$${idx}`); params.push(JSON.stringify(tags)); idx++; }
    if (status !== undefined) {
      updates.push(`status=$${idx}`); params.push(status); idx++;
      if (status === 'published' && comp.status !== 'published') updates.push('published_at=NOW()');
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    updates.push('updated_at=NOW()');
    params.push(id);
    const result = await pool.query(`UPDATE alumni_compositions SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`, params);
    if (status === 'published' && comp.status !== 'published') {
      await pool.query(`UPDATE alumni_profiles SET total_compositions=total_compositions+1 WHERE user_id=$1`, [comp.author_id]);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/compositions PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/compositions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query('SELECT author_id, status FROM alumni_compositions WHERE id=$1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Composition not found.' });
    const comp = existing.rows[0];
    if (comp.author_id !== req.user.id && !['admin','head_teacher'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
    await pool.query('DELETE FROM alumni_compositions WHERE id=$1', [id]);
    if (comp.status === 'published') {
      await pool.query(`UPDATE alumni_profiles SET total_compositions=GREATEST(total_compositions-1,0) WHERE user_id=$1`, [comp.author_id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/compositions DELETE]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Reactions ────────────────────────────────────────────────────────────────

router.post('/compositions/:id/react', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reaction_type } = req.body;
  if (!['like','love','celebrate','support'].includes(reaction_type)) return res.status(400).json({ error: 'Invalid reaction.' });
  try {
    await pool.query(
      `INSERT INTO alumni_composition_reactions (composition_id, user_id, reaction_type) VALUES ($1,$2,$3)
       ON CONFLICT (composition_id, user_id) DO UPDATE SET reaction_type=EXCLUDED.reaction_type`, [id, req.user.id, reaction_type]
    );
    const likes = await pool.query(`SELECT COUNT(*) FROM alumni_composition_reactions WHERE composition_id=$1`, [id]);
    await pool.query(`UPDATE alumni_compositions SET likes_count=$1 WHERE id=$2`, [likes.rows[0].count, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/react]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/compositions/:id/react', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM alumni_composition_reactions WHERE composition_id=$1 AND user_id=$2`, [id, req.user.id]);
    const likes = await pool.query(`SELECT COUNT(*) FROM alumni_composition_reactions WHERE composition_id=$1`, [id]);
    await pool.query(`UPDATE alumni_compositions SET likes_count=$1 WHERE id=$2`, [likes.rows[0].count, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/unreact]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Bookmarks ────────────────────────────────────────────────────────────────

router.post('/compositions/:id/bookmark', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`INSERT INTO alumni_composition_bookmarks (composition_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, req.user.id]);
    const bm = await pool.query(`SELECT COUNT(*) FROM alumni_composition_bookmarks WHERE composition_id=$1`, [id]);
    await pool.query(`UPDATE alumni_compositions SET bookmarks_count=$1 WHERE id=$2`, [bm.rows[0].count, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/bookmark]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/compositions/:id/bookmark', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM alumni_composition_bookmarks WHERE composition_id=$1 AND user_id=$2`, [id, req.user.id]);
    const bm = await pool.query(`SELECT COUNT(*) FROM alumni_composition_bookmarks WHERE composition_id=$1`, [id]);
    await pool.query(`UPDATE alumni_compositions SET bookmarks_count=$1 WHERE id=$2`, [bm.rows[0].count, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/unbookmark]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Comments ─────────────────────────────────────────────────────────────────

router.get('/compositions/:id/comments', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS author_name, ap.username AS author_username
       FROM alumni_composition_comments c JOIN users u ON u.id=c.author_id
       LEFT JOIN alumni_profiles ap ON ap.user_id=c.author_id
       WHERE c.composition_id=$1 AND c.is_deleted=FALSE ORDER BY c.created_at ASC`, [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[alumni/comments GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/compositions/:id/comments', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required.' });
  try {
    const result = await pool.query(
      `INSERT INTO alumni_composition_comments (composition_id, author_id, parent_id, content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, req.user.id, parent_id || null, content.trim()]
    );
    const count = await pool.query(`SELECT COUNT(*) FROM alumni_composition_comments WHERE composition_id=$1 AND is_deleted=FALSE`, [id]);
    await pool.query(`UPDATE alumni_compositions SET comments_count=$1 WHERE id=$2`, [count.rows[0].count, id]);
    await pool.query(`UPDATE alumni_profiles SET total_comments=total_comments+1 WHERE user_id=$1`, [req.user.id]);
    audit('composition_comment', { composition_id: id, user_id: req.user.id });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/comments POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/comments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const c = await pool.query('SELECT author_id, composition_id FROM alumni_composition_comments WHERE id=$1', [id]);
    if (c.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    if (c.rows[0].author_id !== req.user.id && !['admin','head_teacher'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
    await pool.query(`UPDATE alumni_composition_comments SET is_deleted=TRUE WHERE id=$1`, [id]);
    const count = await pool.query(`SELECT COUNT(*) FROM alumni_composition_comments WHERE composition_id=$1 AND is_deleted=FALSE`, [c.rows[0].composition_id]);
    await pool.query(`UPDATE alumni_compositions SET comments_count=$1 WHERE id=$2`, [count.rows[0].count, c.rows[0].composition_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/comments DELETE]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── My Compositions (for author dashboard) ───────────────────────────────────

router.get('/my-compositions', authenticateToken, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    let sql = `SELECT * FROM alumni_compositions WHERE author_id=$1`;
    const params = [req.user.id];
    if (status) { sql += ` AND status=$2`; params.push(status); }
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit));
    params.push(offset);
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[alumni/my-compositions]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Trending / Featured ──────────────────────────────────────────────────────

router.get('/compositions/trending', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS author_name, ap.username AS author_username
       FROM alumni_compositions c JOIN users u ON u.id=c.author_id
       LEFT JOIN alumni_profiles ap ON ap.user_id=c.author_id
       WHERE c.status='published' AND c.published_at > NOW() - INTERVAL '30 days'
       ORDER BY (c.read_count * 0.5 + c.likes_count * 1 + c.comments_count * 2) DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[alumni/trending]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/compositions/featured-authors', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, ap.username, ap.cover_photo_path, ap.bio, ap.total_compositions,
              ap.followers_count, ap.is_verified
       FROM users u JOIN alumni_profiles ap ON ap.user_id=u.id
       WHERE u.role='alumni' AND ap.total_compositions > 0
       ORDER BY ap.total_compositions DESC, ap.followers_count DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[alumni/featured-authors]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
