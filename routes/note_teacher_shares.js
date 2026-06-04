const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const {
  ensureNoteTeacherShareSchema,
  assertSameSchoolTeachers,
} = require('../lib/noteTeacherShares');
const { notifyNoteTeacherShare } = require('../lib/noteTeacherShareNotify');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('teacher', 'head_teacher'));

router.use(async (req, res, next) => {
  try {
    await ensureNoteTeacherShareSchema();
    next();
  } catch (err) {
    console.error('[note_teacher_shares] schema', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET colleagues in the same verified school */
router.get('/colleagues', async (req, res) => {
  try {
    if (!req.user.school_id) {
      return res.json([]);
    }
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_approved,
              p.avatar_path,
              (u.is_approved = TRUE AND u.school_id IS NOT NULL) AS is_verified
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.school_id = $1
         AND u.id != $2
         AND u.role IN ('teacher', 'head_teacher')
         AND u.is_approved = TRUE
         AND COALESCE(u.is_suspended, FALSE) = FALSE
       ORDER BY u.name`,
      [req.user.school_id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[note_teacher_shares/colleagues]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET pending note shares for current teacher */
router.get('/inbox', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ts.*,
              n.title AS note_title,
              n.file_name AS note_file_name,
              sc.name AS source_class_name,
              sc.subject AS source_class_subject,
              st.name AS source_teacher_name,
              st.email AS source_teacher_email,
              (st.is_approved = TRUE AND st.school_id IS NOT NULL) AS source_teacher_verified
       FROM note_teacher_shares ts
       JOIN notes n ON n.id = ts.source_note_id
       JOIN classes sc ON sc.id = ts.source_class_id
       JOIN users st ON st.id = ts.source_teacher_id
       WHERE ts.recipient_teacher_id = $1 AND ts.status = 'pending'
       ORDER BY ts.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[note_teacher_shares/inbox]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST share note with a school colleague */
router.post('/from-class/:classId/notes/:noteId', async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const noteId = parseInt(req.params.noteId, 10);
  const recipientId = parseInt(req.body.recipient_teacher_id, 10);
  const message = (req.body.message || '').trim().slice(0, 500) || null;

  if (!classId || !noteId || !recipientId) {
    return res.status(400).json({ error: 'Recipient teacher is required.' });
  }
  if (recipientId === req.user.id) {
    return res.status(400).json({ error: 'You cannot share a note with yourself.' });
  }

  try {
    const access = await userCanManageClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'You cannot share notes from this class.' });

    const noteRow = await pool.query(
      'SELECT id, class_id, title FROM notes WHERE id = $1 AND class_id = $2 LIMIT 1',
      [noteId, classId]
    );
    if (!noteRow.rows.length) return res.status(404).json({ error: 'Note not found.' });

    const schoolCheck = await assertSameSchoolTeachers(req.user.id, recipientId);
    if (!schoolCheck.ok) return res.status(400).json({ error: schoolCheck.error });

    const dup = await pool.query(
      `SELECT id, status FROM note_teacher_shares
       WHERE source_note_id = $1 AND recipient_teacher_id = $2
         AND status IN ('pending', 'accepted')
       LIMIT 1`,
      [noteId, recipientId]
    );
    if (dup.rows.length) {
      const st = dup.rows[0].status;
      return res.status(409).json({
        error: st === 'pending'
          ? 'This teacher already has a pending invite for this note.'
          : 'This teacher already accepted this note.',
      });
    }

    const ins = await pool.query(
      `INSERT INTO note_teacher_shares
         (source_note_id, source_class_id, source_teacher_id, recipient_teacher_id, message, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING *`,
      [noteId, classId, req.user.id, recipientId, message]
    );

    const classRow = await pool.query('SELECT name FROM classes WHERE id = $1', [classId]);
    const sharerRow = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    notifyNoteTeacherShare({
      shareId: ins.rows[0].id,
      recipientId,
      sharerName: sharerRow.rows[0]?.name || 'A colleague',
      noteTitle: noteRow.rows[0].title,
      sourceClassName: classRow.rows[0]?.name || 'a class',
      message,
    }).catch(() => {});

    res.status(201).json({
      share: ins.rows[0],
      note_title: noteRow.rows[0].title,
      message: 'Share request sent. The colleague must accept before students see the note.',
    });
  } catch (err) {
    console.error('[note_teacher_shares/share]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT accept — recipient picks which of their classes shows the note */
router.put('/:id/accept', async (req, res) => {
  const shareId = parseInt(req.params.id, 10);
  const targetClassId = parseInt(req.body.target_class_id, 10);
  if (!shareId || !targetClassId) {
    return res.status(400).json({ error: 'Choose a class for your students.' });
  }

  try {
    const share = await pool.query(
      'SELECT * FROM note_teacher_shares WHERE id = $1 LIMIT 1',
      [shareId]
    );
    if (!share.rows.length) return res.status(404).json({ error: 'Share request not found.' });
    const row = share.rows[0];
    if (row.recipient_teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the invited teacher can accept.' });
    }
    if (row.status !== 'pending') {
      return res.status(400).json({ error: 'This request was already handled.' });
    }

    const cls = await pool.query(
      'SELECT id, teacher_id FROM classes WHERE id = $1 LIMIT 1',
      [targetClassId]
    );
    if (!cls.rows.length || cls.rows[0].teacher_id !== req.user.id) {
      return res.status(400).json({ error: 'Choose one of your own classes.' });
    }

    const schoolCheck = await assertSameSchoolTeachers(row.source_teacher_id, req.user.id);
    if (!schoolCheck.ok) return res.status(400).json({ error: schoolCheck.error });

    const clash = await pool.query(
      `SELECT id FROM note_teacher_shares
       WHERE source_note_id = $1 AND target_class_id = $2 AND status = 'accepted' AND id != $3
       LIMIT 1`,
      [row.source_note_id, targetClassId, shareId]
    );
    if (clash.rows.length) {
      return res.status(409).json({ error: 'This note is already shared into that class.' });
    }

    const updated = await pool.query(
      `UPDATE note_teacher_shares
       SET status = 'accepted', target_class_id = $1, reviewed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [targetClassId, shareId]
    );

    res.json({
      share: updated.rows[0],
      message: 'Note accepted. Your students will see it with the original teacher and class labeled.',
    });
  } catch (err) {
    console.error('[note_teacher_shares/accept]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT decline */
router.put('/:id/decline', async (req, res) => {
  const shareId = parseInt(req.params.id, 10);
  if (!shareId) return res.status(400).json({ error: 'Invalid request.' });

  try {
    const share = await pool.query(
      'SELECT * FROM note_teacher_shares WHERE id = $1 LIMIT 1',
      [shareId]
    );
    if (!share.rows.length) return res.status(404).json({ error: 'Share request not found.' });
    const row = share.rows[0];
    if (row.recipient_teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the invited teacher can decline.' });
    }
    if (row.status !== 'pending') {
      return res.status(400).json({ error: 'This request was already handled.' });
    }

    const updated = await pool.query(
      `UPDATE note_teacher_shares
       SET status = 'declined', reviewed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [shareId]
    );
    res.json({ share: updated.rows[0] });
  } catch (err) {
    console.error('[note_teacher_shares/decline]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
