const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanInviteParentForStudent, userCanManageClass } = require('../lib/classAccess');
const {
  isSmsConfigured,
  updateParentPhone,
  getParentSmsTarget,
  validateRwandaMobileInput,
} = require('../lib/parentSms');
const { ensureParentSmsSchema } = require('../lib/parentSmsSchema');

const router = express.Router();

ensureParentSmsSchema().catch((e) => console.error('[parent_sms] schema:', e.message));

/** Parent: SMS settings and own phone */
router.get('/sms/settings', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    const target = await getParentSmsTarget(req.user.id);
    const row = await pool.query(
      'SELECT phone, sms_notify FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = row.rows[0] || {};
    res.json({
      sms_configured: isSmsConfigured(),
      phone: u.phone || null,
      sms_notify: u.sms_notify !== false,
      phone_ready: Boolean(target?.e164),
    });
  } catch (err) {
    console.error('[parent sms settings GET]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/sms/settings', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    const { phone, sms_notify } = req.body;
    if (phone !== undefined && phone !== null && String(phone).trim()) {
      await updateParentPhone(req.user.id, phone);
    }
    if (sms_notify !== undefined) {
      await pool.query('UPDATE users SET sms_notify = $1 WHERE id = $2', [
        Boolean(sms_notify),
        req.user.id,
      ]);
    }
    const target = await getParentSmsTarget(req.user.id);
    res.json({
      ok: true,
      phone: target?.phone || null,
      sms_notify: target?.sms_notify !== false,
      phone_ready: Boolean(target?.e164),
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[parent sms settings PUT]', err);
    res.status(500).json({ error: 'Could not save phone settings.' });
  }
});

/** Teacher/HT: parents linked to students in a class (for correcting SMS numbers) */
router.get('/class/:classId/parent-phones', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  if (!Number.isFinite(classId)) return res.status(400).json({ error: 'Invalid class.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You do not manage this class.' });

    const r = await pool.query(
      `SELECT u.id AS student_id, u.name AS student_name,
              p.id AS parent_id, p.name AS parent_name, p.email AS parent_email,
              p.phone AS parent_phone, p.sms_notify
       FROM class_members cm
       JOIN users u ON u.id = cm.student_id
       LEFT JOIN parent_children pc ON pc.student_id = u.id
       LEFT JOIN users p ON p.id = pc.parent_id AND p.role = 'parent'
       WHERE cm.class_id = $1
       ORDER BY u.name ASC, p.name ASC NULLS LAST`,
      [classId]
    );

    const byStudent = new Map();
    for (const row of r.rows) {
      if (!byStudent.has(row.student_id)) {
        byStudent.set(row.student_id, {
          student_id: row.student_id,
          student_name: row.student_name,
          parents: [],
        });
      }
      if (row.parent_id) {
        const entry = byStudent.get(row.student_id);
        if (!entry.parents.some((p) => p.parent_id === row.parent_id)) {
          entry.parents.push({
            parent_id: row.parent_id,
            parent_name: row.parent_name,
            parent_email: row.parent_email,
            parent_phone: row.parent_phone,
            sms_notify: row.sms_notify !== false,
            phone_ready: Boolean(validateRwandaMobileInput(row.parent_phone).valid),
          });
        }
      }
    }

    res.json({
      sms_configured: isSmsConfigured(),
      students: [...byStudent.values()],
    });
  } catch (err) {
    console.error('[parent-phones class]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** Teacher/HT: set or correct a linked parent's mobile for SMS */
router.put('/students/:studentId/parent-phone', authenticateToken, requireRole('teacher', 'head_teacher', 'admin'), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const { phone, parent_id: parentIdRaw } = req.body;
  if (!Number.isFinite(studentId)) return res.status(400).json({ error: 'Invalid student.' });
  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ error: 'Parent phone number is required.' });
  }

  try {
    if (req.user.role !== 'admin' && !(await userCanInviteParentForStudent(req.user, studentId))) {
      return res.status(403).json({ error: 'You can only update parents for students in your classes.' });
    }

    let parentId = parentIdRaw ? parseInt(parentIdRaw, 10) : null;
    if (!parentId) {
      const link = await pool.query(
        `SELECT parent_id FROM parent_children WHERE student_id = $1 ORDER BY linked_at ASC LIMIT 1`,
        [studentId]
      );
      parentId = link.rows[0]?.parent_id;
    }
    if (!parentId) {
      return res.status(404).json({
        error: 'No parent linked yet. Share the parent invite link first, then add their phone.',
      });
    }

    const linkCheck = await pool.query(
      'SELECT 1 FROM parent_children WHERE parent_id = $1 AND student_id = $2',
      [parentId, studentId]
    );
    if (!linkCheck.rows.length) {
      return res.status(403).json({ error: 'That parent is not linked to this student.' });
    }

    const updated = await updateParentPhone(parentId, phone);
    res.json({ ok: true, parent_id: parentId, ...updated });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[parent-phone PUT]', err);
    res.status(500).json({ error: 'Could not save parent phone.' });
  }
});

module.exports = router;
