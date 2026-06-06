const pool = require('../db');

async function ensureQuizSoloReleaseSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_quiz_solo_releases (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (class_id, quiz_id)
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_solo_release_class
      ON class_quiz_solo_releases (class_id);
  `);
  await pool.query(`
    INSERT INTO class_quiz_solo_releases (class_id, quiz_id, released_by)
    SELECT DISTINCT a.class_id, a.quiz_id, NULL
    FROM class_group_quiz_assignments a
    ON CONFLICT (class_id, quiz_id) DO NOTHING
  `).catch(() => {});
}

async function fetchSoloReleasedQuizIds(classId) {
  const r = await pool.query(
    'SELECT quiz_id FROM class_quiz_solo_releases WHERE class_id = $1',
    [classId]
  );
  return new Set(r.rows.map((row) => row.quiz_id));
}

async function fetchGroupOnlyQuizIds(classId) {
  const r = await pool.query(
    `SELECT DISTINCT a.quiz_id
     FROM class_group_quiz_assignments a
     WHERE a.class_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM class_quiz_solo_releases s
         WHERE s.class_id = a.class_id AND s.quiz_id = a.quiz_id
       )`,
    [classId]
  );
  return new Set(r.rows.map((row) => row.quiz_id));
}

async function releaseQuizToClassSolo(classId, quizId, teacherId) {
  await ensureQuizSoloReleaseSchema();
  await pool.query(
    `INSERT INTO class_quiz_solo_releases (class_id, quiz_id, released_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (class_id, quiz_id) DO UPDATE SET
       released_at = NOW(),
       released_by = EXCLUDED.released_by`,
    [classId, quizId, teacherId]
  );
}

async function annotateTeacherQuizzes(classId, rows) {
  await ensureQuizSoloReleaseSchema();
  const groupAssigned = await pool.query(
    'SELECT DISTINCT quiz_id FROM class_group_quiz_assignments WHERE class_id = $1',
    [classId]
  );
  const groupSet = new Set(groupAssigned.rows.map((r) => r.quiz_id));

  return rows.map((q) => ({
    ...q,
    has_group_assignments: groupSet.has(q.id),
    solo_released: true,
    group_only: false,
  }));
}

/** Class quizzes are never hidden from students (group assign keeps class visibility). */
async function studentSoloHiddenQuizIds() {
  return new Set();
}

module.exports = {
  ensureQuizSoloReleaseSchema,
  releaseQuizToClassSolo,
  annotateTeacherQuizzes,
  studentSoloHiddenQuizIds,
  fetchSoloReleasedQuizIds,
};
