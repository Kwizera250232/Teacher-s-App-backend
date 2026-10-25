const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { canUsersMessage } = require('../lib/messagingAccess');

const router = express.Router();
const auth = [authenticateToken];
const { sendMail } = require('../lib/optionalMailer');

/** Email the receiver once per unread conversation — "X messaged you, open UClass to reply". */
async function notifyMessageEmail(senderId, receiverId, preview) {
  try {
    const prior = await pool.query(
      'SELECT COUNT(*)::int AS c FROM messages WHERE sender_id=$1 AND receiver_id=$2 AND is_read=FALSE AND created_at < NOW() - INTERVAL \'1 minute\'',
      [senderId, receiverId]
    );
    if (prior.rows[0].c > 0) return; // already unread + notified
    const recv = await pool.query(
      `SELECT u.email, u.name FROM users u WHERE u.id=$1 AND u.email ~* '^[^@]+@[^@]+\\.[a-z]{2,}$' AND u.email NOT LIKE '%@mail.umunsi.com'`,
      [receiverId]
    );
    const sender = await pool.query('SELECT name FROM users WHERE id=$1', [senderId]);
    const to = recv.rows[0]?.email;
    if (!to) return;
    const link = `${process.env.FRONTEND_URL || 'https://student.umunsi.com'}/messages?to=${senderId}`;
    await sendMail({
      to,
      subject: `💬 New message from ${sender.rows[0]?.name || 'a teacher'} — UClass`,
      text: `Hi ${recv.rows[0]?.name || 'teacher'},\n\n${sender.rows[0]?.name || 'Someone'} sent you a message on UClass:\n"${String(preview).slice(0, 200)}"\n\nReply here: ${link}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto"><h3 style="color:#4f46e5">💬 New message on UClass</h3><p><strong>${sender.rows[0]?.name || 'Someone'}</strong> messaged you:</p><blockquote style="background:#f1f5f9;padding:12px;border-radius:8px;margin:10px 0">${String(preview).slice(0, 300)}</blockquote><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700">Open UClass to reply</a></div>`,
    });
  } catch (e) {
    console.error('[messages] notify email failed:', e.message);
  }
}

// Multer for message images
const msgImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    const dir = process.env.VERCEL ? path.join('/tmp', 'uploads', 'msg_images') : path.join(__dirname, '../uploads/msg_images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`);
  }
});
const uploadMsgImage = multer({
  storage: msgImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// POST /api/messages  — send a message
router.post('/', auth, async (req, res) => {
  const { receiver_id, content } = req.body;
  if (!receiver_id || !content?.trim()) {
    return res.status(400).json({ error: 'receiver_id and content are required.' });
  }
  const rid = parseInt(receiver_id);
  if (isNaN(rid) || rid === req.user.id) {
    return res.status(400).json({ error: 'Invalid receiver.' });
  }
  const allowed = await canUsersMessage(req.user.id, rid, req.user.role);
  if (!allowed) {
    return res.status(403).json({ error: 'You cannot message this user.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, rid, content.trim().slice(0, 2000)]
    );
    notifyMessageEmail(req.user.id, rid, content.trim()); // fire and forget
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/messages/image  — send an image message
router.post('/image', auth, uploadMsgImage.single('image'), async (req, res) => {
  const { receiver_id } = req.body;
  if (!receiver_id || !req.file) return res.status(400).json({ error: 'receiver_id and image required.' });
  const rid = parseInt(receiver_id);
  if (isNaN(rid) || rid === req.user.id) return res.status(400).json({ error: 'Invalid receiver.' });
  const allowed = await canUsersMessage(req.user.id, rid, req.user.role);
  if (!allowed) return res.status(403).json({ error: 'You cannot message this user.' });
  try {
    const imagePath = `/uploads/msg_images/${req.file.filename}`;
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content, image_path) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, rid, '', imagePath]
    );
    res.status(201).json({ image_path: imagePath, message: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/messages/inbox  — my received messages (grouped by sender)
router.get('/inbox', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (m.sender_id)
              m.id, m.sender_id, m.content, m.is_read, m.created_at,
              u.name AS sender_name, u.role AS sender_role, p.avatar_path
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN user_profiles p ON p.user_id = m.sender_id
       WHERE m.receiver_id = $1
       ORDER BY m.sender_id, m.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/messages/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*) FROM messages WHERE receiver_id=$1 AND is_read=FALSE`,
      [req.user.id]
    );
    res.json({ count: parseInt(r.rows[0].count) });
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/messages/thread/:userId  — full conversation with one person
router.get('/thread/:userId', auth, async (req, res) => {
  const otherId = parseInt(req.params.userId);
  if (isNaN(otherId)) return res.status(400).json({ error: 'Invalid user.' });
  try {
    // Mark as read
    await pool.query(
      `UPDATE messages SET is_read=TRUE WHERE receiver_id=$1 AND sender_id=$2`,
      [req.user.id, otherId]
    );
    const result = await pool.query(
      `SELECT m.*, u.name AS sender_name, p.avatar_path
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN user_profiles p ON p.user_id = m.sender_id
       WHERE (m.sender_id=$1 AND m.receiver_id=$2)
          OR (m.sender_id=$2 AND m.receiver_id=$1)
       ORDER BY m.created_at ASC`,
      [req.user.id, otherId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
