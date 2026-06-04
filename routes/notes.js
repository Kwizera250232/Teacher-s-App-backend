const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createUpload } = require('../lib/uploads');
const { ensureNoteTeacherShareSchema } = require('../lib/noteTeacherShares');

const router = express.Router();
const uploadNote = createUpload('file');

async function listNotesForClass(classId) {
  await ensureNoteTeacherShareSchema();
  const native = await pool.query(
    `SELECT n.*,
            FALSE AS is_shared,
            NULL::text AS shared_from_teacher_name,
            NULL::text AS shared_from_class_name,
            NULL::text AS shared_from_class_subject,
            NULL::int AS shared_from_teacher_id,
            FALSE AS shared_from_teacher_verified,
            NULL::int AS teacher_share_id
     FROM notes n
     WHERE n.class_id = $1`,
    [classId]
  );
  const shared = await pool.query(
    `SELECT n.*,
            TRUE AS is_shared,
            st.name AS shared_from_teacher_name,
            sc.name AS shared_from_class_name,
            sc.subject AS shared_from_class_subject,
            st.id AS shared_from_teacher_id,
            (st.is_approved = TRUE AND st.school_id IS NOT NULL) AS shared_from_teacher_verified,
            ts.id AS teacher_share_id
     FROM note_teacher_shares ts
     JOIN notes n ON n.id = ts.source_note_id
     JOIN users st ON st.id = ts.source_teacher_id
     JOIN classes sc ON sc.id = ts.source_class_id
     WHERE ts.target_class_id = $1 AND ts.status = 'accepted'`,
    [classId]
  );
  const merged = [...native.rows, ...shared.rows];
  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return merged;
}

async function teacherOwnsClass(classId, user) {
  const teacherId = user.id;
  const owned = await pool.query(
    'SELECT id FROM classes WHERE id = $1 AND teacher_id = $2',
    [classId, teacherId]
  );
  if (owned.rows.length > 0) return true;
  if (user.role === 'head_teacher' && user.school_id) {
    const ht = await pool.query(
      `SELECT c.id FROM classes c
       JOIN users t ON c.teacher_id = t.id
       WHERE c.id = $1 AND t.school_id = $2`,
      [classId, user.school_id]
    );
    return ht.rows.length > 0;
  }
  return false;
}

// GET notes for a class (includes colleague shares accepted into this class)
router.get('/:classId/notes', authenticateToken, async (req, res) => {
  try {
    const rows = await listNotesForClass(req.params.classId);
    res.json(rows);
  } catch (err) {
    console.error('[notes GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST upload note (teacher)
router.post('/:classId/notes', authenticateToken, requireRole('teacher', 'head_teacher'), (req, res, next) => {
  uploadNote(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const { title } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });

  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;

  try {
    if (!(await teacherOwnsClass(classId, req.user))) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    const result = await pool.query(
      'INSERT INTO notes (class_id, title, file_path, file_name) VALUES ($1,$2,$3,$4) RETURNING *',
      [classId, String(title).trim(), filePath, fileName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[notes POST] error:', err.message, err.code, err.detail);
    res.status(500).json({ error: 'Failed to upload note. Please try again.' });
  }
});

// DELETE note (teacher)
router.delete('/:classId/notes/:noteId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    if (!(await teacherOwnsClass(classId, req.user))) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    const owned = await pool.query(
      'SELECT id FROM notes WHERE id = $1 AND class_id = $2',
      [req.params.noteId, classId]
    );
    if (!owned.rows.length) {
      return res.status(403).json({ error: 'You can only delete notes uploaded to this class.' });
    }
    await pool.query('DELETE FROM notes WHERE id = $1 AND class_id = $2', [req.params.noteId, classId]);
    res.json({ message: 'Note deleted.' });
  } catch (err) {
    console.error('[notes DELETE] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
