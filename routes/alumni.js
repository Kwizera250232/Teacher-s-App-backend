const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Generic file upload
const uploadDir = process.env.VERCEL ? path.join('/tmp', 'uploads', 'files') : path.join(__dirname, '../uploads/files');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const fileStorage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.epub', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, EPUB, DOC, DOCX, and image files allowed.'));
  },
});

router.post('/upload', authenticateToken, fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const url = `/uploads/files/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size });
});

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
       WHERE id=$2 AND role='student' RETURNING id, name, email, graduation_year, graduated_at, school_id, class_id`,
      [yr, req.user.id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Already an alumni or not a student.' });
    const user = result.rows[0];
    // Fetch class_id from class_members before deleting (fallback if users.class_id is null)
    const cmRes = await pool.query('SELECT class_id FROM class_members WHERE student_id=$1 LIMIT 1', [req.user.id]);
    const finalClassId = user.class_id || (cmRes.rows[0] && cmRes.rows[0].class_id) || null;
    await pool.query(
      `INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year, class_id=COALESCE(alumni_profiles.class_id, EXCLUDED.class_id)`,
      [user.id, yr, user.email.split('@')[0] + '-' + user.id, finalClassId]
    );
    await pool.query(`INSERT INTO alumni_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
    // Remove from all class_members so they no longer appear in class lists
    await pool.query('DELETE FROM class_members WHERE student_id=$1', [user.id]);
    audit('alumni_self_join', { user_id: req.user.id, year: yr });
    // Generate new token with updated role
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: user.id, role: 'alumni', email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, alumni: user, token, user: { id: user.id, name: user.name, email: user.email, role: 'alumni', is_alumni: true, graduation_year: yr, school_id: user.school_id } });
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
    // Remove from all class_members so graduated student no longer appears in class lists
    await pool.query('DELETE FROM class_members WHERE student_id=$1', [user.id]);
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
      // Remove from all class_members so graduated students no longer appear in class lists
      await pool.query('DELETE FROM class_members WHERE student_id=$1', [user.id]);
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
      `SELECT ap.*, u.id AS user_id, u.name, u.email, u.role, u.school_id, COALESCE(ap.class_id, u.class_id) as class_id, s.name AS school_name,
              u.graduation_year, u.graduated_at, u.avatar_url
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
    'certificates','awards','reading_list','learning_goals','personal_motto','avatar_url'];
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
      `SELECT ap.*, u.id AS user_id, u.name, u.email, u.role, u.school_id, s.name AS school_name,
              u.graduation_year, u.graduated_at, u.class_id, u.avatar_url
       FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id=u.id
       LEFT JOIN schools s ON s.id=u.school_id
       WHERE (u.id=$1 OR ap.username=$2)`,
      [!isNaN(identifier) ? parseInt(identifier) : 0, identifier]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alumni not found.' });
    const profile = result.rows[0];
    // Check if current user is following this profile
    const followRes = await pool.query(
      'SELECT 1 FROM alumni_follows WHERE follower_id=$1 AND following_id=$2',
      [req.user.id, profile.user_id]
    );
    profile.is_following = followRes.rows.length > 0;
    res.json(profile);
  } catch (err) {
    console.error('[alumni/profile/:id]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Verification info (class joined, teacher, points) ──────────────────────
router.get('/verify-info/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const result = await pool.query(
      `SELECT u.id, u.name, u.role, u.graduation_year, u.class_id,
              c.name AS class_name, c.subject AS class_subject,
              t.name AS teacher_name,
              s.name AS school_name,
              ap.followers_count, ap.total_compositions, ap.total_reads, ap.total_likes,
              COALESCE(ap.total_rewards, 0) AS total_rewards,
              (SELECT COALESCE(SUM(score), 0) FROM quiz_attempts WHERE student_id = u.id) AS quiz_points,
              (SELECT COUNT(*) FROM homework_submissions WHERE student_id = u.id AND grade IS NOT NULL) AS homework_graded
       FROM users u
       LEFT JOIN classes c ON c.id = COALESCE(u.class_id, (SELECT class_id FROM alumni_profiles WHERE user_id = u.id))
       LEFT JOIN users t ON t.id = c.teacher_id
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const info = result.rows[0];
    const points = (info.quiz_points || 0) + (info.total_likes || 0) + (info.total_reads || 0) + (info.total_rewards || 0);
    res.json({
      ...info,
      points,
      verified: info.role === 'alumni' || info.role === 'student',
    });
  } catch (err) {
    console.error('[alumni/verify-info]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Upload avatar ───────────────────────────────────────────────────────────
router.post('/profile/avatar', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), fileUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const url = `/uploads/files/${req.file.filename}`;
    await pool.query(
      `INSERT INTO alumni_profiles (user_id, cover_photo_path) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET cover_photo_path = EXCLUDED.cover_photo_path, updated_at = NOW()`,
      [req.user.id, url]
    );
    await pool.query(`UPDATE users SET avatar_url=$1 WHERE id=$2`, [url, req.user.id]);
    res.json({ url });
  } catch (err) {
    console.error('[alumni/profile/avatar]', err);
    res.status(500).json({ error: 'Failed to upload avatar.' });
  }
});

// ── Suggested alumni ─────────────────────────────────────────────────────────
router.get('/suggested-alumni', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, ap.bio, ap.current_occupation, ap.graduation_year,
              s.name AS school_name,
              ap.followers_count, ap.total_compositions,
              EXISTS(SELECT 1 FROM alumni_follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS is_following
       FROM users u
       JOIN alumni_profiles ap ON ap.user_id = u.id
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.role = 'alumni' AND u.id != $1
       ORDER BY ap.followers_count DESC NULLS LAST, ap.total_compositions DESC NULLS LAST
       LIMIT 8`,
      [req.user.id]
    );
    res.json({ suggested: result.rows });
  } catch (err) {
    console.error('[alumni/suggested-alumni]', err);
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

// ── Public Content Routes (Alumni view) ──

router.get('/library', authenticateToken, async (req, res) => {
  try {
    const books = await pool.query('SELECT * FROM alumni_library ORDER BY created_at DESC');
    res.json({ books: books.rows });
  } catch (err) {
    console.error('[alumni/library]', err);
    res.status(500).json({ error: 'Failed to load books' });
  }
});

router.get('/opportunities', authenticateToken, async (req, res) => {
  try {
    const opps = await pool.query('SELECT * FROM alumni_opportunities ORDER BY created_at DESC');
    res.json({ opportunities: opps.rows });
  } catch (err) {
    console.error('[alumni/opportunities]', err);
    res.status(500).json({ error: 'Failed to load opportunities' });
  }
});

router.get('/past-papers', authenticateToken, async (req, res) => {
  try {
    const papers = await pool.query('SELECT * FROM alumni_past_papers ORDER BY created_at DESC');
    res.json({ papers: papers.rows });
  } catch (err) {
    console.error('[alumni/past-papers]', err);
    res.status(500).json({ error: 'Failed to load past papers' });
  }
});

// ── Admin Content Routes (Admin management) ──

router.get('/admin/alumni/books', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const books = await pool.query('SELECT * FROM alumni_library ORDER BY created_at DESC');
    res.json({ books: books.rows });
  } catch (err) {
    console.error('[alumni/admin/books]', err);
    res.status(500).json({ error: 'Failed to load books' });
  }
});

router.post('/admin/alumni/books', authenticateToken, requireRole('admin', 'head_teacher'), fileUpload.single('file'), async (req, res) => {
  const { title, author, section, category, description, cover_url, download_url } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required.' });
  try {
    const file_url = req.file ? `/uploads/files/${req.file.filename}` : download_url || null;
    const result = await pool.query(
      'INSERT INTO alumni_library (title, author, category, description, file_url, cover_url, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title, author || null, category || section || null, description || null, file_url, cover_url || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/admin/books POST]', err);
    res.status(500).json({ error: 'Failed to add book' });
  }
});

router.delete('/admin/alumni/books/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM alumni_library WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/admin/books DELETE]', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

router.get('/admin/alumni/opportunities', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const opps = await pool.query('SELECT * FROM alumni_opportunities ORDER BY created_at DESC');
    res.json({ opportunities: opps.rows });
  } catch (err) {
    console.error('[alumni/admin/opportunities]', err);
    res.status(500).json({ error: 'Failed to load opportunities' });
  }
});

router.post('/admin/alumni/opportunities', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, category, organization, location, deadline, link, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required.' });
  try {
    const result = await pool.query(
      'INSERT INTO alumni_opportunities (title, company, location, type, description, deadline, link, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [title, organization || null, location || null, category || null, description || null, deadline || null, link || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/admin/opportunities POST]', err);
    res.status(500).json({ error: 'Failed to add opportunity' });
  }
});

router.delete('/admin/alumni/opportunities/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM alumni_opportunities WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/admin/opportunities DELETE]', err);
    res.status(500).json({ error: 'Failed to delete opportunity' });
  }
});

router.get('/admin/alumni/past-papers', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const papers = await pool.query('SELECT * FROM alumni_past_papers ORDER BY created_at DESC');
    res.json({ papers: papers.rows });
  } catch (err) {
    console.error('[alumni/admin/past-papers]', err);
    res.status(500).json({ error: 'Failed to load past papers' });
  }
});

router.post('/admin/alumni/past-papers', authenticateToken, requireRole('admin', 'head_teacher'), fileUpload.single('file'), async (req, res) => {
  const { title, subject, year, description, download_url } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required.' });
  try {
    const file_url = req.file ? `/uploads/files/${req.file.filename}` : download_url || null;
    const result = await pool.query(
      'INSERT INTO alumni_past_papers (title, subject, year, description, file_url, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, subject || null, year || null, description || null, file_url, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/admin/past-papers POST]', err);
    res.status(500).json({ error: 'Failed to add past paper' });
  }
});

router.delete('/admin/alumni/past-papers/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM alumni_past_papers WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/admin/past-papers DELETE]', err);
    res.status(500).json({ error: 'Failed to delete past paper' });
  }
});

// ── Dean AI Quizzes (for admin panel) ───────────────────────────────────────
router.get('/dean-quizzes', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const quizzes = await pool.query(
      `SELECT q.id, q.title, q.subject, q.grade_level, q.description, q.created_at,
              (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count
       FROM quizzes q ORDER BY q.created_at DESC LIMIT 50`
    );
    res.json({ quizzes: quizzes.rows });
  } catch (err) {
    console.error('[alumni/dean-quizzes]', err);
    res.status(500).json({ error: 'Failed to load quizzes' });
  }
});

// ── Primary Things: Historical class data for alumni ────────────────────────
router.get('/primary-things', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  try {
    const userId = req.user.id;
    // Get class_id from alumni_profiles or users table
    const profileRes = await pool.query(
      `SELECT ap.class_id, u.class_id AS user_class_id, u.school_id, u.name, c.name AS class_name,
              c.subject AS class_subject, s.name AS school_name
       FROM users u
       LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
       LEFT JOIN classes c ON c.id = COALESCE(ap.class_id, u.class_id)
       LEFT JOIN schools s ON s.id = u.school_id
       WHERE u.id = $1`,
      [userId]
    );
    if (profileRes.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
    const profile = profileRes.rows[0];
    let classId = profile.class_id || profile.user_class_id;
    // Fallback: find class_id from past quiz attempts or homework submissions
    if (!classId) {
      const fallbackRes = await pool.query(
        `SELECT class_id FROM quizzes WHERE id IN
           (SELECT quiz_id FROM quiz_attempts WHERE student_id=$1)
         UNION
         SELECT class_id FROM homework WHERE id IN
           (SELECT homework_id FROM homework_submissions WHERE student_id=$1)
         LIMIT 1`,
        [userId]
      );
      if (fallbackRes.rows.length > 0) classId = fallbackRes.rows[0].class_id;
    }
    if (!classId) return res.json({ classInfo: null, quizzes: [], homework: [], notes: [], announcements: [], leaderboard: [], discussions: [], cstatus: [], inyandiko: [] });

    // Fetch all data in parallel — using student_id directly, no class_members check
    const [quizzesRes, homeworkRes, notesRes, announcementsRes, leaderboardRes, discussionsRes, cstatusRes, inyandikoRes] = await Promise.all([
      // Quizzes with this student's best score
      pool.query(
        `SELECT q.id, q.title, q.description, q.created_at,
                (SELECT qa.score FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.student_id = $2 ORDER BY qa.score DESC LIMIT 1) AS my_score,
                (SELECT qa.total FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.student_id = $2 ORDER BY qa.score DESC LIMIT 1) AS my_total,
                (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.student_id = $2) AS attempt_count,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count
         FROM quizzes q WHERE q.class_id = $1 ORDER BY q.created_at DESC`,
        [classId, userId]
      ).catch(() => ({ rows: [] })),

      // Homework with this student's submission/grade
      pool.query(
        `SELECT hw.id, hw.title, hw.description, hw.due_date, hw.created_at,
                hs.grade, hs.submitted_at, hs.feedback
         FROM homework hw
         LEFT JOIN homework_submissions hs ON hs.homework_id = hw.id AND hs.student_id = $2
         WHERE hw.class_id = $1 ORDER BY hw.created_at DESC`,
        [classId, userId]
      ).catch(() => ({ rows: [] })),

      // Notes from teachers
      pool.query(
        `SELECT n.id, n.title, n.file_path, n.file_name, n.created_at,
                u.name AS teacher_name
         FROM notes n
         LEFT JOIN classes c ON c.id = n.class_id
         LEFT JOIN users u ON u.id = c.teacher_id
         WHERE n.class_id = $1 ORDER BY n.created_at DESC`,
        [classId]
      ).catch(() => ({ rows: [] })),

      // Announcements
      pool.query(
        `SELECT a.id, a.content, a.created_at, u.name AS teacher_name
         FROM announcements a LEFT JOIN users u ON u.id = a.teacher_id
         WHERE a.class_id = $1 ORDER BY a.created_at DESC`,
        [classId]
      ).catch(() => ({ rows: [] })),

      // Leaderboard — all students who were in this class (including graduated)
      pool.query(
        `WITH best_attempts AS (
           SELECT DISTINCT ON (quiz_id, student_id)
             quiz_id, student_id, score, total
           FROM quiz_attempts
           WHERE quiz_id IN (SELECT id FROM quizzes WHERE class_id = $1)
           ORDER BY quiz_id, student_id, score DESC, attempted_at ASC
         )
         SELECT u.id AS student_id, u.name AS student_name,
                COALESCE(SUM(ba.score), 0) AS total_points,
                COUNT(ba.quiz_id) AS quizzes_taken
         FROM users u
         LEFT JOIN best_attempts ba ON ba.student_id = u.id
         WHERE u.id IN (SELECT student_id FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE class_id = $1))
            OR u.id IN (SELECT student_id FROM homework_submissions hs JOIN homework hw ON hw.id = hs.homework_id WHERE hw.class_id = $1)
         GROUP BY u.id, u.name
         ORDER BY total_points DESC LIMIT 50`,
        [classId]
      ).catch(() => ({ rows: [] })),

      // Discussions
      pool.query(
        `SELECT d.id, d.content, d.created_at, u.name AS author_name, u.role AS author_role
         FROM discussions d LEFT JOIN users u ON u.id = d.user_id
         WHERE d.class_id = $1 ORDER BY d.created_at DESC`,
        [classId]
      ).catch(() => ({ rows: [] })),

      // Composition statuses (Innyandiko / student shares)
      pool.query(
        `SELECT cs.id, cs.created_at, cs.expires_at, s.content, s.type, s.status AS share_status,
                u.name AS student_name,
                (SELECT COUNT(*)::int FROM composition_status_views v WHERE v.status_id = cs.id) AS view_count
         FROM composition_statuses cs
         JOIN student_shares s ON s.id = cs.share_id
         JOIN users u ON u.id = cs.student_id
         WHERE cs.class_id = $1
         ORDER BY cs.created_at DESC`,
        [classId]
      ).catch(() => ({ rows: [] })),

      // Inyandiko documents (commitment + school reports)
      pool.query(
        `SELECT d.id, d.doc_type, d.title, d.file_path, d.file_name, d.uploaded_at,
                u.name AS student_name
         FROM student_class_documents d
         JOIN users u ON u.id = d.student_id
         WHERE d.class_id = $1
         ORDER BY d.uploaded_at DESC`,
        [classId]
      ).catch(() => ({ rows: [] })),
    ]);

    // If class info is missing (fallback case), fetch it
    let classInfoName = profile.class_name;
    let classInfoSubject = profile.class_subject;
    if (!classInfoName && classId) {
      const clsRes = await pool.query('SELECT name, subject FROM classes WHERE id=$1', [classId]);
      if (clsRes.rows.length > 0) {
        classInfoName = clsRes.rows[0].name;
        classInfoSubject = clsRes.rows[0].subject;
      }
    }

    res.json({
      classInfo: {
        class_id: classId,
        name: classInfoName || 'My Class',
        subject: classInfoSubject,
        school_name: profile.school_name,
      },
      quizzes: quizzesRes.rows,
      homework: homeworkRes.rows,
      notes: notesRes.rows,
      announcements: announcementsRes.rows,
      leaderboard: leaderboardRes.rows,
      discussions: discussionsRes.rows,
      cstatus: cstatusRes.rows,
      inyandiko: inyandikoRes.rows,
    });
  } catch (err) {
    console.error('[alumni/primary-things]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Quiz detail for alumni (questions + their answers + correct answers) ────
router.get('/quiz/:quizId/detail', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  try {
    const quizId = req.params.quizId;
    const userId = req.user.id;

    // Get quiz info
    const quizRes = await pool.query(
      `SELECT q.*, c.name AS class_name, c.subject AS class_subject
       FROM quizzes q JOIN classes c ON c.id = q.class_id WHERE q.id = $1`,
      [quizId]
    );
    if (quizRes.rows.length === 0) return res.status(404).json({ error: 'Quiz not found.' });
    const quiz = quizRes.rows[0];

    // Get questions
    const questionsRes = await pool.query(
      `SELECT id, question, option_a, option_b, option_c, option_d, correct_answer, question_type, passage, order_num
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_num`,
      [quizId]
    );

    // Get student's best attempt
    const attemptRes = await pool.query(
      `SELECT * FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2 ORDER BY score DESC LIMIT 1`,
      [quizId, userId]
    );
    const attempt = attemptRes.rows[0] || null;
    const answers = attempt?.answers || {};

    const optionMap = { a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d' };
    const detailed = questionsRes.rows.map((q) => {
      const studentAnswer = String(answers[String(q.id)] ?? '');
      const correctAnswer = q.correct_answer;
      const qtype = q.question_type || 'multiple_choice';
      let isCorrect = false;
      if (qtype === 'fill_blank') {
        isCorrect = studentAnswer.trim().toLowerCase() === (correctAnswer || '').trim().toLowerCase();
      } else {
        isCorrect = studentAnswer.toLowerCase() === (correctAnswer || '').toLowerCase();
      }
      return {
        id: q.id,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        question_type: qtype,
        student_answer: studentAnswer,
        is_correct: isCorrect,
      };
    });

    res.json({
      quiz: { id: quiz.id, title: quiz.title, description: quiz.description, class_name: quiz.class_name, class_subject: quiz.class_subject, created_at: quiz.created_at },
      attempt: attempt ? { score: attempt.score, total: attempt.total, attempted_at: attempt.attempted_at } : null,
      questions: detailed,
    });
  } catch (err) {
    console.error('[alumni/quiz/:quizId/detail]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Homework detail for alumni (with their submission) ──────────────────────
router.get('/homework/:hwId/detail', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  try {
    const hwId = req.params.hwId;
    const userId = req.user.id;

    const hwRes = await pool.query(
      `SELECT hw.*, c.name AS class_name, c.subject AS class_subject
       FROM homework hw JOIN classes c ON c.id = hw.class_id WHERE hw.id = $1`,
      [hwId]
    );
    if (hwRes.rows.length === 0) return res.status(404).json({ error: 'Homework not found.' });
    const hw = hwRes.rows[0];

    const subRes = await pool.query(
      `SELECT * FROM homework_submissions WHERE homework_id = $1 AND student_id = $2`,
      [hwId, userId]
    );
    const submission = subRes.rows[0] || null;

    res.json({
      homework: { id: hw.id, title: hw.title, description: hw.description, due_date: hw.due_date, created_at: hw.created_at, file_path: hw.file_path, file_name: hw.file_name, class_name: hw.class_name, class_subject: hw.class_subject },
      submission: submission ? { grade: submission.grade, feedback: submission.feedback, text_response: submission.text_response, file_path: submission.file_path, file_name: submission.file_name, submitted_at: submission.submitted_at, graded_at: submission.graded_at, teacher_answer: submission.teacher_answer } : null,
    });
  } catch (err) {
    console.error('[alumni/homework/:hwId/detail]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Inyandiko: alumni upload their own document ─────────────────────────────
router.post('/inyandiko/upload', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), fileUpload.single('file'), async (req, res) => {
  const { class_id, doc_type, title } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  if (!class_id) return res.status(400).json({ error: 'class_id is required.' });
  const validTypes = ['commitment', 'school_report', 'other'];
  if (!validTypes.includes(doc_type)) return res.status(400).json({ error: 'Invalid doc_type.' });

  try {
    const result = await pool.query(
      `INSERT INTO student_class_documents (class_id, student_id, doc_type, title, file_path, file_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [class_id, req.user.id, doc_type, title || null, `/uploads/files/${req.file.filename}`, req.file.filename]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/inyandiko/upload]', err);
    res.status(500).json({ error: 'Failed to upload document.' });
  }
});

// ── Digital Library: admin add library item ─────────────────────────────────
router.post('/admin/alumni/library-items', authenticateToken, requireRole('admin', 'head_teacher'), fileUpload.single('file'), async (req, res) => {
  const { title, description, category, grade_level, subject, language, cover_image_path } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required.' });
  const validCategories = ['primary_book','secondary_book','past_paper','revision_note','teacher_resource','university_resource','research_paper','career_guide','government_doc','other'];
  if (!validCategories.includes(category)) return res.status(400).json({ error: 'Invalid category.' });

  try {
    const filePath = req.file ? `/uploads/files/${req.file.filename}` : null;
    const result = await pool.query(
      `INSERT INTO alumni_library_items (title, description, category, file_path, file_name, file_size, cover_image_path, uploader_id, grade_level, subject, language, is_approved, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,NOW()) RETURNING *`,
      [title, description || null, category, filePath, req.file?.filename || null, req.file?.size || null, cover_image_path || null, req.user.id, grade_level || null, subject || null, language || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[alumni/admin/library-items POST]', err);
    res.status(500).json({ error: 'Failed to add library item.' });
  }
});

// ── Digital Library: list all items ─────────────────────────────────────────
router.get('/library-items', authenticateToken, async (req, res) => {
  try {
    const items = await pool.query(
      `SELECT li.*, u.name AS uploader_name FROM alumni_library_items li
       JOIN users u ON u.id = li.uploader_id
       WHERE li.is_approved = TRUE ORDER BY li.created_at DESC`
    );
    res.json({ items: items.rows });
  } catch (err) {
    console.error('[alumni/library-items]', err);
    res.status(500).json({ error: 'Failed to load library items.' });
  }
});

// ── Digital Library: admin list (all, including unapproved) ─────────────────
router.get('/admin/alumni/library-items', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const items = await pool.query(
      `SELECT li.*, u.name AS uploader_name FROM alumni_library_items li
       JOIN users u ON u.id = li.uploader_id ORDER BY li.created_at DESC`
    );
    res.json({ items: items.rows });
  } catch (err) {
    console.error('[alumni/admin/library-items GET]', err);
    res.status(500).json({ error: 'Failed to load library items.' });
  }
});

// ── Digital Library: admin delete item ──────────────────────────────────────
router.delete('/admin/alumni/library-items/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM alumni_library_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/admin/library-items DELETE]', err);
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

// ── Daily Composition Challenges ─────────────────────────────────────────────

// GET random active challenge for alumni
router.get('/composition-challenge/random', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM composition_challenges WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1`
    );
    if (result.rows.length === 0) return res.json({ challenge: null });
    res.json({ challenge: result.rows[0] });
  } catch (err) {
    console.error('[alumni/challenge/random]', err);
    res.status(500).json({ error: 'Failed to load challenge.' });
  }
});

// GET today's challenge (deterministic — same for the day)
router.get('/composition-challenge/today', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM composition_challenges WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1`
    );
    if (result.rows.length === 0) return res.json({ challenge: null });
    const challenge = result.rows[0];
    // Check if user already submitted for this challenge
    const submitted = await pool.query(
      `SELECT id, status FROM composition_submissions WHERE challenge_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [challenge.id, req.user.id]
    );
    res.json({ challenge, alreadySubmitted: submitted.rows[0] || null });
  } catch (err) {
    console.error('[alumni/challenge/today]', err);
    res.status(500).json({ error: 'Failed to load challenge.' });
  }
});

// POST submit a composition
router.post('/composition-challenge/:challengeId/submit', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  const { challengeId } = req.params;
  const { title, content, gmail_address, momo_number, names } = req.body;
  if (!content || content.trim().length < 50) return res.status(400).json({ error: 'Composition must be at least 50 characters.' });
  try {
    const wordCount = content.trim().split(/\s+/).length;
    const result = await pool.query(
      `INSERT INTO composition_submissions (challenge_id, user_id, title, content, word_count, gmail_address, momo_number, names, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
      [challengeId, req.user.id, title || null, content, wordCount, gmail_address || null, momo_number || null, names || null]
    );
    res.json({ submission: result.rows[0] });
  } catch (err) {
    console.error('[alumni/challenge/submit]', err);
    res.status(500).json({ error: 'Failed to submit composition.' });
  }
});

// GET my submissions
router.get('/composition-challenge/my-submissions', authenticateToken, requireRole('alumni', 'admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, c.topic, c.category, c.prompt FROM composition_submissions s
       JOIN composition_challenges c ON c.id = s.challenge_id
       WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('[alumni/challenge/my-submissions]', err);
    res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

// ── Admin: manage challenges ─────────────────────────────────────────────────

// GET all challenges (admin)
router.get('/admin/composition-challenges', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM composition_challenges ORDER BY created_at DESC`);
    res.json({ challenges: result.rows });
  } catch (err) {
    console.error('[alumni/admin/challenges]', err);
    res.status(500).json({ error: 'Failed to load challenges.' });
  }
});

// POST create challenge (admin)
router.post('/admin/composition-challenges', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { topic, prompt, category, guidelines, min_words, max_words } = req.body;
  if (!topic || !prompt) return res.status(400).json({ error: 'Topic and prompt are required.' });
  try {
    const result = await pool.query(
      `INSERT INTO composition_challenges (topic, prompt, category, guidelines, min_words, max_words, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7) RETURNING *`,
      [topic, prompt, category || 'general', guidelines || null, min_words || 150, max_words || 500, req.user.id]
    );
    res.json({ challenge: result.rows[0] });
  } catch (err) {
    console.error('[alumni/admin/challenges/create]', err);
    res.status(500).json({ error: 'Failed to create challenge.' });
  }
});

// PUT toggle challenge active status (admin)
router.put('/admin/composition-challenges/:id/toggle', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE composition_challenges SET is_active = NOT is_active WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    res.json({ challenge: result.rows[0] });
  } catch (err) {
    console.error('[alumni/admin/challenges/toggle]', err);
    res.status(500).json({ error: 'Failed to toggle challenge.' });
  }
});

// DELETE challenge (admin)
router.delete('/admin/composition-challenges/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM composition_challenges WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[alumni/admin/challenges/delete]', err);
    res.status(500).json({ error: 'Failed to delete challenge.' });
  }
});

// GET all submissions (admin)
router.get('/admin/composition-submissions', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? `WHERE s.status = $1` : '';
    const params = status ? [status] : [];
    const result = await pool.query(
      `SELECT s.*, c.topic, c.category, c.prompt, u.name AS author_name, u.email AS author_email
       FROM composition_submissions s
       JOIN composition_challenges c ON c.id = s.challenge_id
       JOIN users u ON u.id = s.user_id
       ${filter} ORDER BY s.created_at DESC`,
      params
    );
    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('[alumni/admin/submissions]', err);
    res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

// PUT review submission (admin) — mark as amazing/reviewed/rejected + set reward
router.put('/admin/composition-submissions/:id/review', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { status, admin_feedback, reward_amount } = req.body;
  if (!['pending','reviewed','amazing','rewarded','rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    const result = await pool.query(
      `UPDATE composition_submissions
       SET status=$1, admin_feedback=$2, reward_amount=$3, reviewed_by=$4, reviewed_at=NOW()
       WHERE id=$5 RETURNING *`,
      [status, admin_feedback || null, reward_amount || 0, req.user.id, req.params.id]
    );
    res.json({ submission: result.rows[0] });
  } catch (err) {
    console.error('[alumni/admin/submissions/review]', err);
    res.status(500).json({ error: 'Failed to review submission.' });
  }
});

module.exports = router;
