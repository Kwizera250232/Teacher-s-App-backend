const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const auth = authenticateToken;

// Multer for message images
const msgImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    const dir = path.join(__dirname, '../uploads/msg_images');
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
  // Ensure sender and receiver share a class
  const shared = await pool.query(
    `SELECT 1 FROM class_members cm1
     JOIN class_members cm2 ON cm1.class_id = cm2.class_id
     WHERE cm1.student_id = $1 AND cm2.student_id = $2
     UNION
     SELECT 1 FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     WHERE (cm.student_id = $1 AND c.teacher_id = $2)
        OR (cm.student_id = $2 AND c.teacher_id = $1)`,
    [req.user.id, rid]
  );
  if (!shared.rowCount && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only message people in your classes.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, rid, content.trim().slice(0, 2000)]
    );
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
