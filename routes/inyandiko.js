const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { ensureUploadsRoot, MAX_UPLOAD_SIZE } = require('../lib/uploads');
const { userCanAccessClass, userCanManageClass, isClassMember } = require('../lib/classAccess');
const multer = require('multer');

const router = express.Router();

const DOC_TYPES = new Set(['commitment', 'school_report']);

pool.query(`
  CREATE TABLE IF NOT EXISTS student_class_documents (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type VARCHAR(32) NOT NULL CHECK (doc_type IN ('commitment', 'school_report')),
    title TEXT,
    file_path TEXT NOT NULL,
    file_name TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
  )
`).catch(console.error);

pool.query(`
  CREATE INDEX IF NOT EXISTS idx_student_class_documents_lookup
  ON student_class_documents (class_id, student_id, doc_type)
`).catch(console.error);

function studentDocsDir() {
  const root = ensureUploadsRoot();
  const dir = path.join(root, 'student_docs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const uploadDocument = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, studentDocsDir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = new Set(['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.txt']);
    if (!allowed.has(ext)) {
      return cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, TXT, and images.'));
    }
    cb(null, true);
  },
}).single('file');

async function fetchQuizMarks(classId, studentId) {
  const result = await pool.query(
    `SELECT
       q.id AS quiz_id,
       q.title AS quiz_title,
       ba.score,
       ba.total,
       ba.attempted_at,
       ROUND(ba.score::numeric / NULLIF(ba.total, 0) * 100) AS percentage,
       (ba.score IS NOT NULL) AS taken
     FROM quizzes q
     LEFT JOIN LATERAL (
       SELECT qa.score, qa.total, qa.attempted_at
       FROM quiz_attempts qa
       WHERE qa.quiz_id = q.id
         AND qa.student_id = $2
       ORDER BY qa.score DESC, qa.attempted_at ASC
       LIMIT 1
     ) ba ON TRUE
     WHERE q.class_id = $1
     ORDER BY q.created_at DESC`,
    [classId, studentId]
  );
  return result.rows;
}

function mapDocumentRow(row) {
  return {
    id: row.id,
    doc_type: row.doc_type,
    title: row.title,
    file_path: row.file_path,
    file_name: row.file_name,
    uploaded_at: row.uploaded_at,
    student_id: row.student_id,
    student_name: row.student_name,
    class_id: row.class_id,
  };
}

async function getManageableClasses(user) {
  if (user.role === 'head_teacher' && user.school_id) {
    const result = await pool.query(
      `SELECT c.id, c.name, c.subject, c.class_code
       FROM classes c
       JOIN users t ON t.id = c.teacher_id
       WHERE t.school_id = $1
          OR c.teacher_id = $2
          OR EXISTS (
            SELECT 1 FROM class_co_teachers ct
            WHERE ct.class_id = c.id AND ct.teacher_id = $2
          )
       ORDER BY c.name ASC`,
      [user.school_id, user.id]
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT c.id, c.name, c.subject, c.class_code
     FROM classes c
     WHERE c.teacher_id = $1
        OR EXISTS (
          SELECT 1 FROM class_co_teachers ct
          WHERE ct.class_id = c.id AND ct.teacher_id = $1
        )
     ORDER BY c.name ASC`,
    [user.id]
  );
  return result.rows;
}

// GET all students' Inyandiko across teacher/HT classes (dashboard)
router.get('/inyandiko/dashboard', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const classes = await getManageableClasses(req.user);
    if (!classes.length) return res.json({ classes: [] });

    const classIds = classes.map((c) => c.id);

    const [membersRes, docsRes, marksRes] = await Promise.all([
      pool.query(
        `SELECT cm.class_id, u.id AS student_id, u.name AS student_name
         FROM class_members cm
         JOIN users u ON u.id = cm.student_id
         WHERE cm.class_id = ANY($1::int[])
         ORDER BY u.name ASC`,
        [classIds]
      ),
      pool.query(
        `SELECT d.id, d.class_id, d.doc_type, d.title, d.file_path, d.file_name,
                d.uploaded_at, d.student_id, u.name AS student_name
         FROM student_class_documents d
         JOIN users u ON u.id = d.student_id
         WHERE d.class_id = ANY($1::int[])
         ORDER BY d.uploaded_at DESC`,
        [classIds]
      ),
      pool.query(
        `SELECT DISTINCT ON (q.class_id, qa.student_id, q.id)
           q.class_id,
           qa.student_id,
           q.id AS quiz_id,
           q.title AS quiz_title,
           qa.score,
           qa.total,
           qa.attempted_at,
           ROUND(qa.score::numeric / NULLIF(qa.total, 0) * 100) AS percentage
         FROM quiz_attempts qa
         JOIN quizzes q ON q.id = qa.quiz_id
         WHERE q.class_id = ANY($1::int[])
         ORDER BY q.class_id, qa.student_id, q.id, qa.score DESC, qa.attempted_at ASC`,
        [classIds]
      ),
    ]);

    const docsByClassStudent = new Map();
    for (const doc of docsRes.rows) {
      const key = `${doc.class_id}:${doc.student_id}`;
      if (!docsByClassStudent.has(key)) {
        docsByClassStudent.set(key, { commitment: null, school_reports: [] });
      }
      const bucket = docsByClassStudent.get(key);
      if (doc.doc_type === 'commitment') {
        if (!bucket.commitment) bucket.commitment = mapDocumentRow(doc);
      } else {
        bucket.school_reports.push(mapDocumentRow(doc));
      }
    }

    const marksByClassStudent = new Map();
    for (const mark of marksRes.rows) {
      const key = `${mark.class_id}:${mark.student_id}`;
      if (!marksByClassStudent.has(key)) marksByClassStudent.set(key, []);
      marksByClassStudent.get(key).push({
        quiz_id: mark.quiz_id,
        quiz_title: mark.quiz_title,
        score: mark.score,
        total: mark.total,
        percentage: mark.percentage,
        attempted_at: mark.attempted_at,
        taken: true,
      });
    }

    const membersByClass = new Map();
    for (const m of membersRes.rows) {
      if (!membersByClass.has(m.class_id)) membersByClass.set(m.class_id, []);
      membersByClass.get(m.class_id).push(m);
    }

    const payload = classes.map((cls) => {
      const members = membersByClass.get(cls.id) || [];
      const students = members.map((m) => {
        const key = `${cls.id}:${m.student_id}`;
        const docs = docsByClassStudent.get(key) || { commitment: null, school_reports: [] };
        return {
          student_id: m.student_id,
          student_name: m.student_name,
          commitment: docs.commitment,
          school_reports: docs.school_reports,
          quiz_marks: marksByClassStudent.get(key) || [],
        };
      });
      return {
        id: cls.id,
        name: cls.name,
        subject: cls.subject,
        class_code: cls.class_code,
        students,
      };
    });

    res.json({ classes: payload });
  } catch (err) {
    console.error('[inyandiko dashboard]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET student's commitment, school reports, and quiz marks (Inyandiko hub)
router.get('/:classId/inyandiko/mine', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class id.' });

    const access = await userCanAccessClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'You are not in this class.' });

    const docs = await pool.query(
      `SELECT id, doc_type, title, file_path, file_name, uploaded_at, student_id
       FROM student_class_documents
       WHERE class_id = $1 AND student_id = $2
       ORDER BY uploaded_at DESC`,
      [classId, req.user.id]
    );

    const commitment = docs.rows.filter((d) => d.doc_type === 'commitment');
    const school_reports = docs.rows.filter((d) => d.doc_type === 'school_report');
    const quiz_marks = await fetchQuizMarks(classId, req.user.id);

    res.json({ commitment, school_reports, quiz_marks });
  } catch (err) {
    console.error('[inyandiko mine]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET all students' documents for teachers (class Inyandiko overview)
router.get('/:classId/inyandiko/students', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class id.' });

    const manage = await userCanManageClass(req.user, classId);
    if (!manage.ok) return res.status(403).json({ error: 'You cannot view this class.' });

    const result = await pool.query(
      `SELECT d.id, d.doc_type, d.title, d.file_path, d.file_name, d.uploaded_at,
              d.student_id, u.name AS student_name
       FROM student_class_documents d
       JOIN users u ON u.id = d.student_id
       WHERE d.class_id = $1
       ORDER BY u.name ASC, d.uploaded_at DESC`,
      [classId]
    );

    res.json(result.rows.map(mapDocumentRow));
  } catch (err) {
    console.error('[inyandiko students]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST upload commitment letter or school report (student)
router.post('/:classId/inyandiko/documents', authenticateToken, requireRole('student'), (req, res, next) => {
  uploadDocument(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ error: 'Invalid class id.' });

    if (!(await isClassMember(classId, req.user.id))) {
      return res.status(403).json({ error: 'You are not in this class.' });
    }

    const docType = String(req.body.doc_type || '').trim();
    if (!DOC_TYPES.has(docType)) {
      return res.status(400).json({ error: 'doc_type must be commitment or school_report.' });
    }
    if (!req.file) return res.status(400).json({ error: 'File is required.' });

    const title = String(req.body.title || req.file.originalname || '').trim() || null;
    const relPath = `student_docs/${req.file.filename}`;

    if (docType === 'commitment') {
      await pool.query(
        `DELETE FROM student_class_documents
         WHERE class_id = $1 AND student_id = $2 AND doc_type = 'commitment'`,
        [classId, req.user.id]
      );
    }

    const inserted = await pool.query(
      `INSERT INTO student_class_documents
         (class_id, student_id, doc_type, title, file_path, file_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [classId, req.user.id, docType, title, relPath, req.file.originalname]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    console.error('[inyandiko upload]', err);
    res.status(500).json({ error: 'Failed to upload document.' });
  }
});

// DELETE own document (student) or any in class (teacher)
router.delete('/:classId/inyandiko/documents/:docId', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const docId = parseInt(req.params.docId, 10);
    if (Number.isNaN(classId) || Number.isNaN(docId)) {
      return res.status(400).json({ error: 'Invalid id.' });
    }

    const docRes = await pool.query(
      'SELECT * FROM student_class_documents WHERE id = $1 AND class_id = $2',
      [docId, classId]
    );
    if (docRes.rows.length === 0) return res.status(404).json({ error: 'Document not found.' });
    const doc = docRes.rows[0];

    const isOwner = req.user.role === 'student' && doc.student_id === req.user.id;
    const manage = await userCanManageClass(req.user, classId);
    if (!isOwner && !manage.ok) {
      return res.status(403).json({ error: 'Not allowed to delete this document.' });
    }

    const uploadsRoot = ensureUploadsRoot();
    const abs = path.join(uploadsRoot, doc.file_path.replace(/^\/+/, ''));
    if (fs.existsSync(abs)) {
      try { fs.unlinkSync(abs); } catch (_) { /* ignore */ }
    }

    await pool.query('DELETE FROM student_class_documents WHERE id = $1', [docId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[inyandiko delete]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
