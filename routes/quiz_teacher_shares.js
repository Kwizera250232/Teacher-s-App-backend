const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const {
  ensureQuizTeacherShareSchema,
  assertSameSchoolTeachers,
  getTeacherSchoolId,
} = require('../lib/quizTeacherShares');
const { notifyQuizTeacherShare } = require('../lib/quizTeacherShareNotify');

const router = express.Router();

function colleagueSelectSql() {
  return `SELECT u.id, u.name, u.email, u.role, u.is_approved,
                 p.avatar_path,
                 (u.is_approved = TRUE AND u.school_id IS NOT NULL) AS is_verified
          FROM users u
          LEFT JOIN user_profiles p ON p.user_id = u.id`;
}

async function findColleagueByEmail(sharerId, schoolId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const result = await pool.query(
    `${colleagueSelectSql()}
     WHERE u.email = $1
       AND u.school_id = $2
       AND u.id != $3
       AND u.role IN ('teacher', 'head_teacher')
       AND u.is_approved = TRUE
       AND COALESCE(u.is_suspended, FALSE) = FALSE
     LIMIT 1`,
    [normalized, schoolId, sharerId]
  );
  return result.rows[0] || null;
}

async function resolveRecipientId(sharerId, { recipient_teacher_id, recipient_email }) {
  const id = parseInt(recipient_teacher_id, 10);
  if (id) return { recipientId: id };

  const colleague = await findColleagueByEmail(
    sharerId,
    (await getTeacherSchoolId(sharerId))?.school_id,
    recipient_email
  );
  if (!colleague) {
    const schoolId = (await getTeacherSchoolId(sharerId))?.school_id;
    if (!schoolId) {
      return { error: 'Join a school before sharing quizzes with colleagues.', status: 400 };
    }
    return {
      error: 'No verified teacher at your school uses that email. Check the address or pick from the list.',
      status: 404,
    };
  }
  return { recipientId: colleague.id, colleague };
}

async function createQuizShareRequest(req, { classId, quizId, recipientId, message }) {
  const access = await userCanManageClass(req.user, classId);
  if (!access.ok) return { status: 403, error: 'You cannot share quizzes from this class.' };

  const quizRow = await pool.query(
    'SELECT id, class_id, title FROM quizzes WHERE id = $1 AND class_id = $2 LIMIT 1',
    [quizId, classId]
  );
  if (!quizRow.rows.length) return { status: 404, error: 'Quiz not found.' };

  const schoolCheck = await assertSameSchoolTeachers(req.user.id, recipientId);
  if (!schoolCheck.ok) return { status: 400, error: schoolCheck.error };

  const dup = await pool.query(
    `SELECT id, status FROM quiz_teacher_shares
     WHERE source_quiz_id = $1 AND recipient_teacher_id = $2
       AND status IN ('pending', 'accepted')
     LIMIT 1`,
    [quizId, recipientId]
  );
  if (dup.rows.length) {
    const st = dup.rows[0].status;
    return {
      status: 409,
      error: st === 'pending'
        ? 'This teacher already has a pending invite for this quiz.'
        : 'This teacher already accepted this quiz.',
    };
  }

  const classMeta = await pool.query(
    'SELECT name FROM classes WHERE id = $1 LIMIT 1',
    [classId]
  );
  const recipientRow = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1 LIMIT 1',
    [recipientId]
  );

  const ins = await pool.query(
    `INSERT INTO quiz_teacher_shares
       (source_quiz_id, source_class_id, source_teacher_id, recipient_teacher_id, message, status)
     VALUES ($1,$2,$3,$4,$5,'pending')
     RETURNING *`,
    [quizId, classId, req.user.id, recipientId, message]
  );

  let emailSent = false;
  try {
    const notify = await notifyQuizTeacherShare({
      shareId: ins.rows[0].id,
      recipientId,
      recipientEmail: recipientRow.rows[0]?.email,
      recipientName: recipientRow.rows[0]?.name,
      sharerName: req.user.name,
      quizTitle: quizRow.rows[0].title,
      sourceClassName: classMeta.rows[0]?.name || 'a class',
      message,
    });
    emailSent = notify.email_sent;
  } catch (notifyErr) {
    console.error('[quiz_teacher_shares] notify', notifyErr);
  }

  return {
    status: 201,
    body: {
      share: ins.rows[0],
      quiz_title: quizRow.rows[0].title,
      recipient: recipientRow.rows[0] || null,
      email_sent: emailSent,
      message: emailSent
        ? 'Invitation sent. Your colleague will get an email and see it on their dashboard to accept.'
        : 'Invitation sent. Your colleague will see it on their dashboard to accept.',
    },
  };
}

router.use(authenticateToken);
router.use(requireRole('teacher', 'head_teacher'));

router.use(async (req, res, next) => {
  try {
    await ensureQuizTeacherShareSchema();
    next();
  } catch (err) {
    console.error('[quiz_teacher_shares] schema', err);
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
      `${colleagueSelectSql()}
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
    console.error('[quiz_teacher_shares/colleagues]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET lookup colleague by email (same school) */
router.get('/lookup', async (req, res) => {
  try {
    if (!req.user.school_id) {
      return res.status(400).json({ error: 'Join a school before sharing quizzes with colleagues.' });
    }
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Teacher email is required.' });

    const colleague = await findColleagueByEmail(req.user.id, req.user.school_id, email);
    if (!colleague) {
      return res.status(404).json({
        error: 'No verified teacher at your school uses that email. Check the address or pick from the list.',
      });
    }
    res.json({ teacher: colleague });
  } catch (err) {
    console.error('[quiz_teacher_shares/lookup]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** GET pending shares for current teacher */
router.get('/inbox', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ts.*,
              q.title AS quiz_title,
              q.description AS quiz_description,
              sc.name AS source_class_name,
              sc.subject AS source_class_subject,
              st.name AS source_teacher_name,
              st.email AS source_teacher_email,
              (st.is_approved = TRUE AND st.school_id IS NOT NULL) AS source_teacher_verified
       FROM quiz_teacher_shares ts
       JOIN quizzes q ON q.id = ts.source_quiz_id
       JOIN classes sc ON sc.id = ts.source_class_id
       JOIN users st ON st.id = ts.source_teacher_id
       WHERE ts.recipient_teacher_id = $1 AND ts.status = 'pending'
       ORDER BY ts.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[quiz_teacher_shares/inbox]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST share quiz with a school colleague (by id or email) */
router.post('/from-class/:classId/quizzes/:quizId', async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const quizId = parseInt(req.params.quizId, 10);
  const message = (req.body.message || '').trim().slice(0, 500) || null;

  if (!classId || !quizId) {
    return res.status(400).json({ error: 'Invalid class or quiz.' });
  }

  try {
    const resolved = await resolveRecipientId(req.user.id, req.body);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({ error: resolved.error });
    }
    const { recipientId } = resolved;
    if (recipientId === req.user.id) {
      return res.status(400).json({ error: 'You cannot share a quiz with yourself.' });
    }

    const result = await createQuizShareRequest(req, {
      classId,
      quizId,
      recipientId,
      message,
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[quiz_teacher_shares/share]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT accept — recipient picks which of their classes shows the quiz */
router.put('/:id/accept', async (req, res) => {
  const shareId = parseInt(req.params.id, 10);
  const targetClassId = parseInt(req.body.target_class_id, 10);
  if (!shareId || !targetClassId) {
    return res.status(400).json({ error: 'Choose a class for your students.' });
  }

  try {
    const share = await pool.query(
      'SELECT * FROM quiz_teacher_shares WHERE id = $1 LIMIT 1',
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
      `SELECT id FROM quiz_teacher_shares
       WHERE source_quiz_id = $1 AND target_class_id = $2 AND status = 'accepted' AND id != $3
       LIMIT 1`,
      [row.source_quiz_id, targetClassId, shareId]
    );
    if (clash.rows.length) {
      return res.status(409).json({ error: 'This quiz is already shared into that class.' });
    }

    const updated = await pool.query(
      `UPDATE quiz_teacher_shares
       SET status = 'accepted', target_class_id = $1, reviewed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [targetClassId, shareId]
    );

    res.json({
      share: updated.rows[0],
      message: 'Quiz accepted. Your students will see it with the original teacher and class labeled.',
    });
  } catch (err) {
    console.error('[quiz_teacher_shares/accept]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** PUT decline */
router.put('/:id/decline', async (req, res) => {
  const shareId = parseInt(req.params.id, 10);
  if (!shareId) return res.status(400).json({ error: 'Invalid request.' });

  try {
    const share = await pool.query(
      'SELECT * FROM quiz_teacher_shares WHERE id = $1 LIMIT 1',
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
      `UPDATE quiz_teacher_shares
       SET status = 'declined', reviewed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [shareId]
    );
    res.json({ share: updated.rows[0] });
  } catch (err) {
    console.error('[quiz_teacher_shares/decline]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
