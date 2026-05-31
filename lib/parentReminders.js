const pool = require('../db');
const { insertParentNotification } = require('./parentHub');

/** In-app daily reminders for parents (homework due within 24h). Deduped per homework. */
async function runParentDailyReminders(parentId) {
  const due = await pool.query(
    `SELECT h.id AS homework_id, h.title, h.due_date, c.name AS class_name,
            st.id AS student_id, st.name AS student_name
     FROM parent_children pc
     JOIN users st ON st.id = pc.student_id
     JOIN class_members cm ON cm.student_id = st.id
     JOIN classes c ON c.id = cm.class_id
     JOIN homework h ON h.class_id = c.id
     LEFT JOIN homework_submissions hs ON hs.homework_id = h.id AND hs.student_id = st.id
     WHERE pc.parent_id = $1
       AND hs.id IS NULL
       AND h.due_date IS NOT NULL
       AND h.due_date > NOW()
       AND h.due_date <= NOW() + INTERVAL '24 hours'`,
    [parentId]
  );

  for (const row of due.rows) {
    const dedupe = await pool.query(
      `SELECT 1 FROM parent_notifications
       WHERE parent_id = $1 AND type = 'homework_reminder'
         AND payload->>'homework_id' = $2
         AND created_at > NOW() - INTERVAL '20 hours'`,
      [parentId, String(row.homework_id)]
    );
    if (dedupe.rows.length) continue;

    const dueStr = row.due_date ? new Date(row.due_date).toLocaleString() : '';
    await insertParentNotification({
      parentId,
      studentId: row.student_id,
      type: 'homework_reminder',
      title: `Homework due soon — ${row.student_name}`,
      body: `${row.class_name}: "${row.title}" due ${dueStr}`,
      payload: { homework_id: row.homework_id, class_name: row.class_name },
    });
  }
}

module.exports = { runParentDailyReminders };
