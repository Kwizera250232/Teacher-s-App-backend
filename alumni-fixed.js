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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.epub', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif'];
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
    // UClass stores class_id on users table directly
    let sql = `SELECT u.id, u.name, u.email, u.school_id, u.class_id,
               c.name AS class_name, s.name AS school_name, u.created_at
               FROM users u
               JOIN schools s ON s.id=u.school_id
               LEFT JOIN classes c ON c.id=u.class_id
               WHERE u.role='student' AND u.is_alumni=FALSE`;
    const params = [];
    let idx = 1;

    // For teachers, only show students from their own classes
    if (req.user.role === 'teacher') {
      const teacherClasses = await pool.query('SELECT id FROM classes WHERE teacher_id=$1', [req.user.id]);
      const classIds = teacherClasses.rows.map(r => r.id);
      if (classIds.length > 0) {
        sql += ` AND u.class_id = ANY($${idx}::int[])`;
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
  const allowed = ['avatar_url','bio','current_school_or_uni','current_location','skills','interests','languages',
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

router.post('/join', authenticateToken, async (req, res) => {
  try {
    await pool.query("UPDATE users SET is_alumni = TRUE, role = 'alumni', graduated_at = NOW(), alumni_status = 'active' WHERE id = $1", [req.user.id]);
    const result = await pool.query('SELECT id, name, email, role, school_id, is_approved, email_confirmed FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    const jwt = require('jsonwebtoken');
    const newToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, message: 'Welcome to Alumni!', token: newToken, user });
  } catch (err) {
    console.error('[alumni/join]', err);
    res.status(500).json({ error: 'Could not join alumni network.' });
  }
});


// Search quizzes by grade/subject/year
router.get('/dean-quizzes/search', authenticateToken, async (req, res) => {
  try {
    const { grade, subject, year } = req.query;
    const searchTerm = grade + ' ' + subject;
    const quizzes = await pool.query(
      "SELECT q.* FROM quizzes q WHERE q.title ILIKE $1 OR q.category ILIKE $1 OR q.title ILIKE $2 ORDER BY q.created_at DESC LIMIT 10",
      ['%' + searchTerm + '%', '%' + subject + '%']
    );
    res.json({ quizzes: quizzes.rows });
  } catch (err) {
    console.error('[dean-quizzes/search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});




// ── Alumni History: Notes, Quizzes, Homework ──

router.get('/my-notes', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT class_id, school_id FROM users WHERE id = $1', [req.user.id]);
    const { class_id } = userRes.rows[0] || {};
    if (!class_id) return res.json({ notes: [] });
    const notes = await pool.query(
      'SELECT n.*, u.name as teacher_name FROM notes n LEFT JOIN users u ON n.teacher_id = u.id WHERE n.class_id = $1 ORDER BY n.created_at DESC',
      [class_id]
    );
    res.json({ notes: notes.rows });
  } catch (err) {
    console.error('[alumni/my-notes]', err);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

router.get('/my-quizzes', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT class_id FROM users WHERE id = $1', [req.user.id]);
    const { class_id } = userRes.rows[0] || {};
    if (!class_id) return res.json({ quizzes: [] });
    const quizzes = await pool.query(
      'SELECT q.*, qr.score, qr.status FROM quizzes q LEFT JOIN quiz_results qr ON q.id = qr.quiz_id AND qr.student_id = $1 WHERE q.class_id = $2 ORDER BY q.created_at DESC',
      [req.user.id, class_id]
    );
    res.json({ quizzes: quizzes.rows });
  } catch (err) {
    console.error('[alumni/my-quizzes]', err);
    res.status(500).json({ error: 'Failed to load quizzes' });
  }
});

router.get('/my-homework', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT class_id FROM users WHERE id = $1', [req.user.id]);
    const { class_id } = userRes.rows[0] || {};
    if (!class_id) return res.json({ homework: [] });
    const homework = await pool.query(
      'SELECT h.*, hs.grade as my_grade FROM homework h LEFT JOIN homework_submissions hs ON h.id = hs.homework_id AND hs.student_id = $1 WHERE h.class_id = $2 ORDER BY h.created_at DESC',
      [req.user.id, class_id]
    );
    res.json({ homework: homework.rows });
  } catch (err) {
    console.error('[alumni/my-homework]', err);
    res.status(500).json({ error: 'Failed to load homework' });
  }
});

// ── Dean AI Quiz Routes ──

router.get('/dean-quizzes', authenticateToken, async (req, res) => {
  try {
    const quizzes = await pool.query(
      'SELECT q.*, COUNT(qq.id) as question_count FROM quizzes q LEFT JOIN quiz_questions qq ON q.id = qq.quiz_id WHERE q.alumni_visible = TRUE GROUP BY q.id ORDER BY q.created_at DESC LIMIT 20'
    );
    res.json({ quizzes: quizzes.rows });
  } catch (err) {
    console.error('[dean-quizzes]', err);
    res.status(500).json({ error: 'Failed to load quizzes' });
  }
});

router.get('/dean-quizzes/search', authenticateToken, async (req, res) => {
  try {
    const { grade, subject } = req.query;
    const searchTerm = (grade || '') + ' ' + (subject || '');
    const quizzes = await pool.query(
      "SELECT q.* FROM quizzes q WHERE q.alumni_visible = TRUE AND (q.title ILIKE $1 OR q.category ILIKE $2) ORDER BY q.created_at DESC LIMIT 10",
      ['%' + searchTerm + '%', '%' + (subject || '') + '%']
    );
    res.json({ quizzes: quizzes.rows });
  } catch (err) {
    console.error('[dean-quizzes/search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/dean-quizzes/:id', authenticateToken, async (req, res) => {
  try {
    const quiz = await pool.query('SELECT * FROM quizzes WHERE id = $1 AND alumni_visible = TRUE', [req.params.id]);
    const questions = await pool.query('SELECT * FROM quiz_questions WHERE quiz_id = $1', [req.params.id]);
    res.json({ quiz: quiz.rows[0], questions: questions.rows });
  } catch (err) {
    console.error('[dean-quizzes/id]', err);
    res.status(500).json({ error: 'Failed to load quiz' });
  }
});

router.post('/dean-quizzes/submit', authenticateToken, async (req, res) => {
  try {
    const { quiz_id, answers, score } = req.body;
    await pool.query(
      'INSERT INTO alumni_quiz_results (user_id, quiz_id, answers, score, created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (user_id, quiz_id) DO UPDATE SET answers=$3, score=$4, created_at=NOW()',
      [req.user.id, quiz_id, JSON.stringify(answers), score]
    );
    res.json({ success: true, score });
  } catch (err) {
    console.error('[dean-quizzes/submit]', err);
    res.status(500).json({ error: 'Failed to submit' });
  }
});

// ── Public Content Routes ──

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
    const papers = await pool.query('SELECT * FROM alumni_past_papers ORDER BY year DESC, created_at DESC');
    res.json({ papers: papers.rows });
  } catch (err) {
    console.error('[alumni/past-papers]', err);
    res.status(500).json({ error: 'Failed to load past papers' });
  }
});

// ── Admin Routes ──

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'head_teacher') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.post('/admin/books', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, author, section, cover_url, download_url, description } = req.body;
    const result = await pool.query(
      'INSERT INTO alumni_library (title, author, section, cover_url, download_url, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, author, section, cover_url, download_url, description]
    );
    res.json({ success: true, book: result.rows[0] });
  } catch (err) {
    console.error('[admin/books]', err);
    res.status(500).json({ error: 'Failed to add book' });
  }
});

router.put('/admin/books/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, author, section, cover_url, download_url, description } = req.body;
    const result = await pool.query(
      'UPDATE alumni_library SET title=$1, author=$2, section=$3, cover_url=$4, download_url=$5, description=$6, updated_at=NOW() WHERE id=$7 RETURNING *',
      [title, author, section, cover_url, download_url, description, req.params.id]
    );
    res.json({ success: true, book: result.rows[0] });
  } catch (err) {
    console.error('[admin/books/update]', err);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

router.delete('/admin/books/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM alumni_library WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/books/delete]', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

router.post('/admin/opportunities', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, category, organization, location, deadline, link, description } = req.body;
    const result = await pool.query(
      'INSERT INTO alumni_opportunities (title, category, organization, location, deadline, link, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title, category, organization, location, deadline, link, description]
    );
    res.json({ success: true, opportunity: result.rows[0] });
  } catch (err) {
    console.error('[admin/opportunities]', err);
    res.status(500).json({ error: 'Failed to add opportunity' });
  }
});

router.put('/admin/opportunities/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, category, organization, location, deadline, link, description } = req.body;
    const result = await pool.query(
      'UPDATE alumni_opportunities SET title=$1, category=$2, organization=$3, location=$4, deadline=$5, link=$6, description=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [title, category, organization, location, deadline, link, description, req.params.id]
    );
    res.json({ success: true, opportunity: result.rows[0] });
  } catch (err) {
    console.error('[admin/opportunities/update]', err);
    res.status(500).json({ error: 'Failed to update opportunity' });
  }
});

router.delete('/admin/opportunities/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM alumni_opportunities WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/opportunities/delete]', err);
    res.status(500).json({ error: 'Failed to delete opportunity' });
  }
});

router.post('/admin/past-papers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, subject, year, pdf_url } = req.body;
    const result = await pool.query(
      'INSERT INTO alumni_past_papers (title, subject, year, pdf_url) VALUES ($1,$2,$3,$4) RETURNING *',
      [title, subject, year, pdf_url]
    );
    res.json({ success: true, paper: result.rows[0] });
  } catch (err) {
    console.error('[admin/past-papers]', err);
    res.status(500).json({ error: 'Failed to add past paper' });
  }
});

router.put('/admin/past-papers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, subject, year, pdf_url } = req.body;
    const result = await pool.query(
      'UPDATE alumni_past_papers SET title=$1, subject=$2, year=$3, pdf_url=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [title, subject, year, pdf_url, req.params.id]
    );
    res.json({ success: true, paper: result.rows[0] });
  } catch (err) {
    console.error('[admin/past-papers/update]', err);
    res.status(500).json({ error: 'Failed to update past paper' });
  }
});

router.delete('/admin/past-papers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM alumni_past_papers WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/past-papers/delete]', err);
    res.status(500).json({ error: 'Failed to delete past paper' });
  }
});

// Top writers for sidebar
router.get('/top-writers', authenticateToken, async (req, res) => {
  try {
    const writers = await pool.query(
      'SELECT u.id, u.name, u.school_id, s.name as school, COUNT(DISTINCT a.id) as articles FROM users u LEFT JOIN alumni_feed_posts a ON a.user_id = u.id LEFT JOIN schools s ON u.school_id = s.id WHERE u.role = \'alumni\' OR u.is_alumni = TRUE GROUP BY u.id, s.name ORDER BY articles DESC LIMIT 5'
    );
    res.json({ writers: writers.rows.map(w => ({ id: w.id, name: w.name, school: w.school || 'UClass', articles: parseInt(w.articles) || 0, avatar: w.name ? w.name[0] : '?' })) });
  } catch (err) {
    console.error('[alumni/top-writers]', err);
    res.status(500).json({ error: 'Failed to load writers' });
  }
});

// Get single post
router.get('/feed/:id', authenticateToken, async (req, res) => {
  try {
    const post = await pool.query(
      'SELECT f.*, u.name as author_name FROM alumni_feed_posts f LEFT JOIN users u ON f.user_id = u.id WHERE f.id = $1',
      [req.params.id]
    );
    const comments = await pool.query(
      'SELECT c.*, u.name as author_name FROM alumni_feed_comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.post_id = $1 ORDER BY c.created_at DESC',
      [req.params.id]
    );
    res.json({ post: post.rows[0], comments: comments.rows });
  } catch (err) {
    console.error('[alumni/feed/id]', err);
    res.status(500).json({ error: 'Failed to load post' });
  }
});

module.exports = router;
