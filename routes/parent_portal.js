const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass, userCanInviteParentForStudent } = require('../lib/classAccess');
const { insertParentNotification, sendParentInAppMessage } = require('../lib/parentHub');
const { buildParentInviteResponse } = require('../lib/parentInvite');

const router = express.Router();

async function ensureParentSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_children (
      parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      linked_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (parent_id, student_id)
    );
    CREATE TABLE IF NOT EXISTS parent_invite_tokens (
      id SERIAL PRIMARY KEY,
      token VARCHAR(64) UNIQUE NOT NULL,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      creator_id INTEGER REFERENCES users(id),
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '90 days'
    );
    CREATE TABLE IF NOT EXISTS parent_weekly_digests (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      sent_by INTEGER REFERENCES users(id),
      digest_json JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('teacher', 'student', 'admin', 'head_teacher', 'parent'));
  `).catch(() => {});
}

ensureParentSchema().catch((e) => console.error('[parent_portal] schema:', e.message));

async function createParentInviteForStudent(req, res, studentId) {
  const student = await pool.query(
    `SELECT u.id, u.name FROM users u WHERE u.id=$1 AND u.role='student'`,
    [studentId]
  );
  if (!student.rows.length) return res.status(404).json({ error: 'Student not found.' });
  const payload = await buildParentInviteResponse(req, studentId, student.rows[0].name);
  res.json(payload);
}

// List students this teacher/HT can create parent invites for
router.get('/invitable-students', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const user = req.user;
    let result;
    if (user.role === 'head_teacher' && user.school_id) {
      result = await pool.query(
        `SELECT DISTINCT u.id, u.name, c.id AS class_id, c.name AS class_name
         FROM class_members cm
         JOIN users u ON u.id = cm.student_id AND u.role = 'student'
         JOIN classes c ON c.id = cm.class_id
         JOIN users t ON t.id = c.teacher_id
         WHERE t.school_id = $1
            OR c.teacher_id = $2
            OR EXISTS (SELECT 1 FROM class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = $2)
         ORDER BY c.name ASC, u.name ASC`,
        [user.school_id, user.id]
      );
    } else {
      result = await pool.query(
        `SELECT DISTINCT u.id, u.name, c.id AS class_id, c.name AS class_name
         FROM class_members cm
         JOIN users u ON u.id = cm.student_id AND u.role = 'student'
         JOIN classes c ON c.id = cm.class_id
         WHERE c.teacher_id = $1
            OR EXISTS (SELECT 1 FROM class_co_teachers ct WHERE ct.class_id = c.id AND ct.teacher_id = $1)
         ORDER BY c.name ASC, u.name ASC`,
        [user.id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('[invitable-students]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Parent invite link — teachers/HT for their students, or student for themselves (GET/POST)
async function parentLinkHandler(req, res) {
  const studentId = parseInt(req.params.studentId, 10);
  if (!Number.isFinite(studentId)) return res.status(400).json({ error: 'Invalid student.' });
  try {
    if (req.user.role === 'student') {
      if (req.user.id !== studentId) {
        return res.status(403).json({ error: 'You can only create a parent invite for your own account.' });
      }
      return await createParentInviteForStudent(req, res, studentId);
    }
    if (!['teacher', 'head_teacher', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    if (req.user.role !== 'admin' && !(await userCanInviteParentForStudent(req.user, studentId))) {
      return res.status(403).json({ error: 'You can only invite parents for students in your classes.' });
    }
    await createParentInviteForStudent(req, res, studentId);
  } catch (err) {
    console.error('[parent-link]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}
router.get('/students/:studentId/parent-link', authenticateToken, parentLinkHandler);
router.post('/students/:studentId/parent-link', authenticateToken, parentLinkHandler);

router.get('/my/parent-invite', authenticateToken, handleStudentParentInvite);
router.post('/my/parent-invite', authenticateToken, handleStudentParentInvite);

// Public preview for parent invite
router.get('/invite-preview', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Token required.' });
  try {
    const result = await pool.query(
      `SELECT pit.*, u.name AS student_name
       FROM parent_invite_tokens pit
       JOIN users u ON u.id = pit.student_id
       WHERE pit.token = $1 AND pit.used = FALSE AND pit.expires_at > NOW()`,
      [token]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invalid or expired parent invitation.' });
    res.json({
      role: 'parent',
      student_name: result.rows[0].student_name,
      student_id: result.rows[0].student_id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Parent dashboard: linked children
router.get('/children', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email,
              (SELECT COUNT(DISTINCT cm.class_id) FROM class_members cm WHERE cm.student_id = u.id) AS class_count
       FROM parent_children pc
       JOIN users u ON u.id = pc.student_id
       WHERE pc.parent_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Parent: feed for child's class (filtered)
router.get('/children/:studentId/feed', authenticateToken, requireRole('parent'), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const classId = req.query.class_id ? parseInt(req.query.class_id, 10) : null;
  try {
    const link = await pool.query(
      'SELECT 1 FROM parent_children WHERE parent_id=$1 AND student_id=$2',
      [req.user.id, studentId]
    );
    if (!link.rows.length) return res.status(403).json({ error: 'Forbidden.' });

    let classFilter = '';
    const params = [studentId, req.user.id];
    if (classId) {
      classFilter = ' AND p.class_id = $3';
      params.push(classId);
    }

    const posts = await pool.query(
      `SELECT p.*, u.name AS author_name, u.role AS author_role, c.name AS class_name,
              (SELECT COUNT(*)::int FROM classroom_feed_likes l WHERE l.post_id = p.id) AS like_count,
              (SELECT COUNT(*)::int FROM classroom_feed_comments cm WHERE cm.post_id = p.id) AS comment_count
       FROM classroom_feed_posts p
       JOIN users u ON u.id = p.author_id
       JOIN classes c ON c.id = p.class_id
       JOIN class_members mem ON mem.class_id = p.class_id AND mem.student_id = $1
       WHERE p.author_id = $1 ${classFilter}
       ORDER BY p.created_at DESC
       LIMIT 80`,
      params
    );
    res.json(posts.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Teacher: build weekly digest for a class (returns JSON; email when SMTP configured)
router.post('/classes/:classId/weekly-digest', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const manage = await userCanManageClass(req.user, classId);
  if (!manage.ok) return res.status(403).json({ error: 'Forbidden.' });

  try {
    const students = await pool.query(
      `SELECT u.id, u.name, u.email FROM class_members cm
       JOIN users u ON u.id = cm.student_id WHERE cm.class_id = $1`,
      [classId]
    );

    const digests = [];
    for (const student of students.rows) {
      const parents = await pool.query(
        `SELECT u.id, u.name, u.email FROM parent_children pc
         JOIN users u ON u.id = pc.parent_id WHERE pc.student_id = $1`,
        [student.id]
      );

      const feedCount = await pool.query(
        `SELECT COUNT(*) FROM classroom_feed_posts WHERE class_id=$1 AND author_id=$2`,
        [classId, student.id]
      );

      const digest = {
        student_name: student.name,
        class_id: classId,
        posts_this_week: parseInt(feedCount.rows[0].count, 10),
        behavior_note: (req.body.behavior_note || '').trim() || null,
        work_summary: (req.body.work_summary || '').trim() || 'See classroom feed for recent work.',
        attendance: (req.body.attendance || '').trim() || null,
        gaps: (req.body.gaps || '').trim() || null,
        parents_notified: parents.rows.map((p) => p.email),
      };

      await pool.query(
        `INSERT INTO parent_weekly_digests (student_id, class_id, sent_by, digest_json)
         VALUES ($1,$2,$3,$4)`,
        [student.id, classId, req.user.id, JSON.stringify(digest)]
      );

      const title = `Weekly update — ${student.name}`;
      const body = [
        digest.behavior_note && `Behavior: ${digest.behavior_note}`,
        digest.work_summary && `Work: ${digest.work_summary}`,
        digest.attendance && `Attendance: ${digest.attendance}`,
        digest.gaps && `Areas to improve: ${digest.gaps}`,
      ].filter(Boolean).join('\n');

      for (const parent of parents.rows) {
        await insertParentNotification({
          parentId: parent.id,
          studentId: student.id,
          senderId: req.user.id,
          type: 'weekly_digest',
          title,
          body: body || 'Weekly school update is available.',
          payload: digest,
        });
        await sendParentInAppMessage({
          senderId: req.user.id,
          parentId: parent.id,
          content: `📊 ${title}\n\n${body || 'See your child summary in UClass.'}`,
          messageType: 'weekly_digest',
          contextJson: { student_name: student.name, ...digest },
        });
      }

      digests.push(digest);
    }

    res.json({
      message: 'Weekly digest saved and sent to linked parents in the app.',
      digests,
      notified_in_app: true,
    });
  } catch (err) {
    console.error('[weekly-digest]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
