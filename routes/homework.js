const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createUpload } = require('../lib/uploads');
const { userCanManageClass } = require('../lib/classAccess');
const { notifyClassAudiencePush } = require('../lib/classContentNotify');

const router = express.Router();
const uploadHomework = createUpload('file');

// GET homework for a class
router.get('/:classId/homework', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM homework WHERE class_id = $1 ORDER BY created_at DESC',
      [req.params.classId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[homework GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST create homework (teacher)
router.post('/:classId/homework', authenticateToken, requireRole('teacher', 'head_teacher'), (req, res, next) => {
  uploadHomework(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const { title, description, due_date } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });

  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });

  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;

  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    const result = await pool.query(
      'INSERT INTO homework (class_id, title, description, due_date, file_path, file_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [classId, String(title).trim(), description || null, due_date || null, filePath, fileName]
    );
    notifyClassAudiencePush({
      classId,
      excludeUserId: req.user.id,
      title: '📝 New homework',
      body: `"${String(title).trim()}" was added to your class.`,
      contentType: 'homework',
      tag: `homework-${result.rows[0].id}`,
    }).catch(() => {});
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[homework POST] error:', err.message, err.code, err.detail);
    res.status(500).json({ error: 'Failed to create homework. Please try again.' });
  }
});

// DELETE homework (teacher)
router.delete('/:classId/homework/:hwId', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) {
      return res.status(403).json({ error: 'You do not own this class.' });
    }
    await pool.query('DELETE FROM homework WHERE id = $1 AND class_id = $2', [req.params.hwId, classId]);
    res.json({ message: 'Homework deleted.' });
  } catch (err) {
    console.error('[homework DELETE] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET submissions for a homework (teacher)
router.get('/:classId/homework/:hwId/submissions', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT hs.*, u.name AS student_name FROM homework_submissions hs
       JOIN users u ON hs.student_id = u.id
       WHERE hs.homework_id = $1
       ORDER BY hs.submitted_at DESC`,
      [req.params.hwId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[homework submissions GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET student's own submission for a homework
router.get('/:classId/homework/:hwId/my-submission', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM homework_submissions WHERE homework_id = $1 AND student_id = $2',
      [req.params.hwId, req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('[homework my-submission GET] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST submit homework (student) — file or text
router.post('/:classId/homework/:hwId/submit', authenticateToken, requireRole('student'), (req, res, next) => {
  uploadHomework(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const { text_response } = req.body;
  const filePath = req.file ? req.file.filename : null;
  const fileName = req.file ? req.file.originalname : null;
  if (!filePath && !text_response) {
    return res.status(400).json({ error: 'Please provide a file or written response.' });
  }
  if (text_response && text_response.trim().length < 200) {
    return res.status(400).json({ error: 'Written response must be at least 200 characters. Please write a more complete answer.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO homework_submissions (homework_id, student_id, file_path, file_name, text_response, submitted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (homework_id, student_id)
       DO UPDATE SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name,
         text_response = EXCLUDED.text_response, submitted_at = NOW(),
         grade = NULL, feedback = NULL, graded_at = NULL
       RETURNING *`,
      [req.params.hwId, req.user.id, filePath, fileName, text_response || null]
    );

    try {
      const meta = await pool.query(
        `SELECT h.title, h.class_id, c.teacher_id, u.name AS student_name
         FROM homework h
         JOIN classes c ON c.id = h.class_id
         JOIN users u ON u.id = $2
         WHERE h.id = $1`,
        [req.params.hwId, req.user.id]
      );
      const row = meta.rows[0];
      if (row) {
        const { notifyTeachersHomeworkSubmitted } = require('../lib/staffActivityNotify');
        await notifyTeachersHomeworkSubmitted({
          classId: row.class_id,
          homeworkId: parseInt(req.params.hwId, 10),
          homeworkTitle: row.title,
          studentName: row.student_name,
        });
        const { notifyParentsOfStudent } = require('../lib/parentClassNotify');
        await notifyParentsOfStudent({
          studentId: req.user.id,
          senderId: row.teacher_id,
          type: 'homework_submitted',
          title: `${row.student_name} submitted homework`,
          body: `“${row.title}” — open My child to see progress.`,
          payload: {
            class_id: row.class_id,
            homework_id: parseInt(req.params.hwId, 10),
            url: '/parent/dashboard?tab=child',
            student_id: req.user.id,
          },
        });
      }
    } catch (e) {
      console.error('[homework staff/parent notify]', e.message);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[homework submit] error:', err.message, err.code, err.detail);
    res.status(500).json({ error: 'Failed to submit homework. Please try again.' });
  }
});

// PUT grade a submission (teacher)
router.put('/:classId/homework/:hwId/submissions/:subId/grade', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const { grade, feedback, teacher_answer } = req.body;
  if (grade === undefined || grade === null) return res.status(400).json({ error: 'Grade is required.' });
  const gradeNum = parseInt(grade, 10);
  if (Number.isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
    return res.status(400).json({ error: 'Grade must be a number between 0 and 100.' });
  }
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

    const result = await pool.query(
      `UPDATE homework_submissions SET grade = $1, feedback = $2, teacher_answer = $3, graded_at = NOW()
       WHERE id = $4 RETURNING *`,
      [gradeNum, feedback || null, teacher_answer || null, req.params.subId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });
    const sub = result.rows[0];
    res.json(sub);
  } catch (err) {
    console.error('[homework grade] error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
