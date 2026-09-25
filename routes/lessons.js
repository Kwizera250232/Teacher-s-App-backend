// routes/lessons.js — Recorded "Lesson of the day" routes
const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createUploadFields } = require('../lib/uploads');
const { userCanManageClass, userCanAccessClass } = require('../lib/classAccess');
const { notifyClassAudiencePush } = require('../lib/classContentNotify');

const router = express.Router();
const uploadLesson = createUploadFields([
  { name: 'audio', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

async function ensureLessonTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_lessons (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subject VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        audio_path VARCHAR(500),
        audio_name VARCHAR(255),
        file_path VARCHAR(500),
        file_name VARCHAR(255),
        quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.error('[lessons] schema error:', e.message);
  }
}
ensureLessonTable();

// GET /:classId/lessons — list lessons for a class (newest first)
router.get('/:classId/lessons', authenticateToken, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Forbidden.' });
    const result = await pool.query(
      `SELECT l.*, q.title AS quiz_title, u.name AS teacher_name
       FROM class_lessons l
       LEFT JOIN quizzes q ON q.id = l.quiz_id
       LEFT JOIN users u ON u.id = l.teacher_id
       WHERE l.class_id = $1
       ORDER BY l.created_at DESC`,
      [classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[lessons GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /:classId/lessons — create a lesson (teacher): voice summary + written exercises + linked quiz
router.post('/:classId/lessons', authenticateToken, requireRole('teacher', 'head_teacher'), (req, res, next) => {
  uploadLesson(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  const { title, subject, description, quiz_id } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });

  const audio = req.files && req.files.audio && req.files.audio[0];
  const doc = req.files && req.files.file && req.files.file[0];
  const quizId = parseInt(quiz_id, 10);

  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not own this class.' });
    const result = await pool.query(
      `INSERT INTO class_lessons (class_id, teacher_id, subject, title, description, audio_path, audio_name, file_path, file_name, quiz_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        classId, req.user.id,
        (subject && String(subject).trim()) || 'General',
        String(title).trim(), description || null,
        audio ? audio.filename : null, audio ? audio.originalname : null,
        doc ? doc.filename : null, doc ? doc.originalname : null,
        Number.isNaN(quizId) ? null : quizId,
      ]
    );
    notifyClassAudiencePush({
      classId,
      excludeUserId: req.user.id,
      title: '🎙 New lesson',
      body: `"${String(title).trim()}" was added to your class.`,
      contentType: 'lesson',
      tag: `lesson-${result.rows[0].id}`,
    }).catch(() => {});
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[lessons POST] error:', err.message, err.code, err.detail);
    res.status(500).json({ error: 'Failed to save lesson. Please try again.' });
  }
});

// DELETE /:classId/lessons/:lessonId — delete a lesson (teacher)
router.delete('/:classId/lessons/:lessonId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not own this class.' });
    await pool.query('DELETE FROM class_lessons WHERE id = $1 AND class_id = $2', [req.params.lessonId, classId]);
    res.json({ message: 'Lesson deleted.' });
  } catch (err) {
    console.error('[lessons DELETE] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
