const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

function audit(event, details) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
}

// ── Student Self-Join Alumni ────────────────────────────────────────────────

router.post('/join', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can join Alumni.' });
  }
  const yr = new Date().getFullYear();
  try {
    const result = await pool.query(
      `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=$2 AND role='student' RETURNING id, name, email, graduation_year, graduated_at, school_id`,
      [yr, req.user.id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Already an alumni or not a student.' });
    const user = result.rows[0];
    await pool.query(
      `INSERT INTO alumni_profiles (user_id, graduation_year, username)
       VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year`,
      [user.id, yr, user.email.split('@')[0] + '-' + user.id]
    );
    await pool.query(`INSERT INTO alumni_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
    audit('alumni_self_join', { user_id: req.user.id, year: yr });
    res.json({ success: true, alumni: user });
  } catch (err) {
    console.error('[alumni/join]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Graduation Management ───────────────────────────────────────────────────

router.post('/graduate', authenticateToken, requireRole('admin', 'head_teacher', 'teacher'), async (req, res) => {
  const { student_id, graduation_year } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id required.' });
  const yr = graduation_year || new Date().getFullYear();
  try {
    const result = await pool.query(
      `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=$2 AND role='student' RETURNING id, name, email, graduation_year, graduated_at, school_id, class_id`,
      [yr, student_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found or already graduated.' });
    const user = result.rows[0];
    await pool.query(
      `INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id, school_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year, class_id=EXCLUDED.class_id, school_id=EXCLUDED.school_id`,
      [user.id, yr, user.email.split('@')[0] + '-' + user.id, user.class_id, user.school_id]
    );
    await pool.query(`INSERT INTO alumni_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
    audit('graduate_student', { by: req.user.id, student_id, year: yr });
    res.json({ success: true, alumni: user });
  } catch (err) {
    console.error('[alumni/graduate]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/graduate-bulk', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { student_ids, graduation_year } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) return res.status(400).json({ error: 'student_ids array required.' });
  const yr = graduation_year || new Date().getFullYear();
  try {
    const result = await pool.query(
      `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=ANY($2::int[]) AND role='student' RETURNING id, name, email, school_id, class_id`,
      [yr, student_ids]
    );
    for (const user of result.rows) {
      await pool.query(
        `INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id, school_id)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year, class_id=EXCLUDED.class_id, school_id=EXCLUDED.school_id`,
        [user.id, yr, user.email.split('@')[0] + '-' + user.id, user.class_id, user.school_id]
      );
      await pool.query(`INSERT INTO alumni_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
    }
    audit('graduate_bulk', { by: req.user.id, count: result.rows.length });
    res.json({ success: true, graduated: result.rows.length });
  } catch (err) {
    console.error('[alumni/graduate-bulk]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/students-for-graduation', authenticateToken, requireRole('admin', 'head_teacher', 'teacher'), async (req, res) => {
  const { school_id } = req.query;
  try {
    let sql = `SELECT DISTINCT u.id, u.name, u.email, u.school_id,
               cm.class_id, c.name AS class_name, s.name AS school_name, u.created_at
               FROM users u
               JOIN schools s ON s.id=u.school_id
               LEFT JOIN class_members cm ON cm.student_id=u.id
               LEFT JOIN classes c ON c.id=cm.class_id
               WHERE u.role='student' AND u.is_alumni=FALSE`;
    const params = [];
    let idx = 1;

    if (req.user.role === 'teacher') {
      const teacherClasses = await pool.query('SELECT id FROM classes WHERE teacher_id=$1', [req.user.id]);
      const classIds = teacherClasses.rows.map(r => r.id);
      if (classIds.length > 0) {
        sql += ` AND cm.class_id = ANY($${idx}::int[])`;
        params.push(classIds);
        idx++;
      } else {
        return res.json([]);
      }
    }

    if (school_id) {
      sql += ` AND u.school_id=$${idx}`;
      params.push(school_id);
      idx++;
    }
    sql += ' ORDER BY u.name';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[alumni/students-for-graduation]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Alumni Profile ──────────────────────────────────────────────────────────

router.get('/profile/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ap.*, u.name, u.email, u.role, u.school_id, COALESCE(ap.class_id, u.class_id) as class_id, s.name AS school_name,
              u.graduation_year, u.graduated_at
       FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id=u.id
       LEFT JOIN schools s ON s.id=u.school_id WHERE u.id=$1`, [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/profile/me]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/profile/me', authenticateToken, async (req, res) => {
  const allowed = ['bio','current_school_or_uni','current_location','skills','interests','languages',
    'social_links','portfolio_links','favorite_subject','favorite_teacher','favorite_teacher_reason',
    'favorite_club','dream_career','current_occupation','volunteer_experience','projects',
    'certificates','awards','reading_list','learning_goals','personal_motto'];
  const updates = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields.' });
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = fields.map((f, i) => `${f}=$${i + 1}`).join(', ');
  try {
    await pool.query(
      `INSERT INTO alumni_profiles (user_id, ${fields.join(', ')})
       VALUES ($${fields.length + 1}, ${fields.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${setClause}, updated_at=NOW()`,
      [...values, req.user.id]
    );
    audit('alumni_profile_update', { user_id: req.user.id });
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/profile/me PUT]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/profile/:identifier', authenticateToken, async (req, res) => {
  const { identifier } = req.params;
  try {
    const result = await pool.query(
      `SELECT ap.*, u.name, u.email, u.role, u.school_id, s.name AS school_name,
              u.graduation_year, u.graduated_at
       FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id=u.id
       LEFT JOIN schools s ON s.id=u.school_id
       WHERE (u.id=$1 OR ap.username=$2) AND u.role='alumni'`,
      [!isNaN(identifier) ? parseInt(identifier) : 0, identifier]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alumni not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/profile/:id]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Alumni Directory ──────────────────────────────────────────────────────────

router.get('/directory', authenticateToken, async (req, res) => {
  const { search, school_id, graduation_year, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const where = ["u.role='alumni'"];
    const params = [];
    let idx = 1;
    if (search) { where.push(`(u.name ILIKE $${idx} OR ap.bio ILIKE $${idx} OR ap.current_occupation ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (school_id) { where.push(`u.school_id=$${idx}`); params.push(school_id); idx++; }
    if (graduation_year) { where.push(`u.graduation_year=$${idx}`); params.push(graduation_year); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id=u.id WHERE ${where.join(' AND ')}`, params);
    const total = parseInt(countRes.rows[0].count);
    params.push(parseInt(limit));
    params.push(offset);

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.graduation_year, u.graduated_at, ap.username, ap.bio,
              ap.cover_photo_path, ap.current_occupation, ap.current_school_or_uni, ap.skills,
              ap.interests, ap.is_verified, ap.followers_count, ap.following_count, ap.total_compositions,
              s.name AS school_name
       FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id=u.id
       LEFT JOIN schools s ON s.id=u.school_id
       WHERE ${where.join(' AND ')}
       ORDER BY u.graduated_at DESC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    res.json({ alumni: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[alumni/directory]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Wallet ───────────────────────────────────────────────────────────────────

router.get('/wallet', authenticateToken, requireRole('alumni', 'admin'), async (req, res) => {
  try {
    const w = await pool.query(`SELECT * FROM alumni_wallets WHERE user_id=$1`, [req.user.id]);
    const tx = await pool.query(`SELECT * FROM alumni_wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    res.json({ wallet: w.rows[0] || null, transactions: tx.rows });
  } catch (err) {
    console.error('[alumni/wallet]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Admin: reward composition
router.post('/rewards', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { composition_id, user_id, amount, notes } = req.body;
  if (!composition_id || !user_id || !amount) return res.status(400).json({ error: 'composition_id, user_id, amount required.' });
  try {
    await pool.query(`INSERT INTO alumni_composition_rewards (composition_id, user_id, amount, status, notes) VALUES ($1,$2,$3,'pending',$4)`, [composition_id, user_id, amount, notes || null]);
    await pool.query(`UPDATE alumni_wallets SET pending_rewards=pending_rewards+$1 WHERE user_id=$2`, [amount, user_id]);
    audit('reward_created', { by: req.user.id, composition_id, user_id, amount });
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/rewards POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/rewards/:id/pay', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { id } = req.params;
  const { payment_method, payment_reference, mobile_number } = req.body;
  try {
    const rw = await pool.query(`SELECT * FROM alumni_composition_rewards WHERE id=$1`, [id]);
    if (rw.rows.length === 0) return res.status(404).json({ error: 'Reward not found.' });
    if (rw.rows[0].status !== 'pending') return res.status(400).json({ error: 'Already processed.' });
    await pool.query(
      `UPDATE alumni_composition_rewards SET status='paid', paid_by=$1, paid_at=NOW(), payment_method=$2, payment_reference=$3, mobile_number=$4 WHERE id=$5`,
      [req.user.id, payment_method || null, payment_reference || null, mobile_number || null, id]
    );
    const { user_id, amount } = rw.rows[0];
    await pool.query(
      `UPDATE alumni_wallets SET reward_balance=reward_balance+$1, total_earned=total_earned+$1, total_paid=total_paid+$1, pending_rewards=GREATEST(pending_rewards-$1,0) WHERE user_id=$2`,
      [amount, user_id]
    );
    await pool.query(
      `INSERT INTO alumni_wallet_transactions (user_id, type, amount, status, description, paid_by) VALUES ($1,'reward',$2,'paid',$3,$4)`,
      [user_id, amount, `Composition reward #${id}`, req.user.id]
    );
    await pool.query(`UPDATE alumni_profiles SET total_rewards=total_rewards+$1 WHERE user_id=$2`, [amount, user_id]);
    audit('reward_paid', { by: req.user.id, reward_id: id, user_id, amount });
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/rewards pay]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/rewards/pending', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.name AS author_name, c.title AS composition_title
       FROM alumni_composition_rewards r JOIN users u ON u.id=r.user_id
       JOIN alumni_compositions c ON c.id=r.composition_id WHERE r.status='pending' ORDER BY r.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[alumni/rewards pending]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Follows ──────────────────────────────────────────────────────────────────

router.post('/follow/:userId', authenticateToken, async (req, res) => {
  const followingId = parseInt(req.params.userId);
  if (followingId === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself.' });
  try {
    await pool.query(`INSERT INTO alumni_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, followingId]);
    const fc = await pool.query(`SELECT COUNT(*) FROM alumni_follows WHERE following_id=$1`, [followingId]);
    const myfc = await pool.query(`SELECT COUNT(*) FROM alumni_follows WHERE follower_id=$1`, [req.user.id]);
    await pool.query(`UPDATE alumni_profiles SET followers_count=$1 WHERE user_id=$2`, [fc.rows[0].count, followingId]);
    await pool.query(`UPDATE alumni_profiles SET following_count=$1 WHERE user_id=$2`, [myfc.rows[0].count, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/follow]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/follow/:userId', authenticateToken, async (req, res) => {
  const followingId = parseInt(req.params.userId);
  try {
    await pool.query(`DELETE FROM alumni_follows WHERE follower_id=$1 AND following_id=$2`, [req.user.id, followingId]);
    const fc = await pool.query(`SELECT COUNT(*) FROM alumni_follows WHERE following_id=$1`, [followingId]);
    const myfc = await pool.query(`SELECT COUNT(*) FROM alumni_follows WHERE follower_id=$1`, [req.user.id]);
    await pool.query(`UPDATE alumni_profiles SET followers_count=$1 WHERE user_id=$2`, [fc.rows[0].count, followingId]);
    await pool.query(`UPDATE alumni_profiles SET following_count=$1 WHERE user_id=$2`, [myfc.rows[0].count, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/unfollow]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/follows/:userId', authenticateToken, async (req, res) => {
  const userId = parseInt(req.params.userId);
  try {
    const followers = await pool.query(
      `SELECT f.follower_id, u.name, ap.username, ap.cover_photo_path AS avatar
       FROM alumni_follows f JOIN users u ON u.id=f.follower_id
       LEFT JOIN alumni_profiles ap ON ap.user_id=f.follower_id
       WHERE f.following_id=$1 ORDER BY f.created_at DESC`, [userId]
    );
    const following = await pool.query(
      `SELECT f.following_id, u.name, ap.username, ap.cover_photo_path AS avatar
       FROM alumni_follows f JOIN users u ON u.id=f.following_id
       LEFT JOIN alumni_profiles ap ON ap.user_id=f.following_id
       WHERE f.follower_id=$1 ORDER BY f.created_at DESC`, [userId]
    );
    res.json({ followers: followers.rows, following: following.rows });
  } catch (err) {
    console.error('[alumni/follows]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Notifications ────────────────────────────────────────────────────────────

router.get('/notifications', authenticateToken, async (req, res) => {
  const { unread_only } = req.query;
  try {
    let sql = `SELECT * FROM alumni_notifications WHERE user_id=$1`;
    const params = [req.user.id];
    if (unread_only === 'true') { sql += ' AND is_read=FALSE'; }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const result = await pool.query(sql, params);
    const unreadCount = await pool.query(`SELECT COUNT(*) FROM alumni_notifications WHERE user_id=$1 AND is_read=FALSE`, [req.user.id]);
    res.json({ notifications: result.rows, unread_count: parseInt(unreadCount.rows[0].count) });
  } catch (err) {
    console.error('[alumni/notifications]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(`UPDATE alumni_notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/notifications read]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(`UPDATE alumni_notifications SET is_read=TRUE WHERE user_id=$1`, [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/notifications read-all]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Recognitions ─────────────────────────────────────────────────────────────

router.get('/recognitions/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ar.*, u.name AS awarded_by_name, s.name AS school_name
       FROM alumni_recognitions ar
       JOIN users u ON u.id=ar.awarded_by
       LEFT JOIN schools s ON s.id=ar.school_id
       WHERE ar.user_id=$1 ORDER BY ar.awarded_at DESC`, [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[alumni/recognitions]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/recognitions', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { user_id, title, badge_type, period, description, school_id } = req.body;
  if (!user_id || !title || !badge_type) return res.status(400).json({ error: 'user_id, title, badge_type required.' });
  try {
    const result = await pool.query(
      `INSERT INTO alumni_recognitions (user_id, title, badge_type, awarded_by, school_id, period, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user_id, title, badge_type, req.user.id, school_id || null, period || null, description || null]
    );
    audit('recognition_awarded', { by: req.user.id, user_id, badge_type });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/recognitions POST]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
