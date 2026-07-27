-- Graduated students must not remain in class_members, otherwise the class keeps
-- showing them as active members and the teacher cannot reuse the class.
-- Older graduation code updated users.role but never removed the membership rows,
-- so we backfill the class link first and only then drop the stale rows.

BEGIN;

-- 1. Preserve which class each alumni graduated from, taken from their remaining
--    membership row, before those rows are deleted.
UPDATE users u
SET class_id = cm.class_id
FROM class_members cm
WHERE cm.student_id = u.id
  AND u.role = 'alumni'
  AND u.class_id IS NULL;

-- 2. Mirror the same link onto the alumni profile.
UPDATE alumni_profiles ap
SET class_id = u.class_id
FROM users u
WHERE u.id = ap.user_id
  AND u.role = 'alumni'
  AND ap.class_id IS NULL
  AND u.class_id IS NOT NULL;

-- 3. Alumni are no longer class members.
DELETE FROM class_members cm
USING users u
WHERE u.id = cm.student_id
  AND u.role = 'alumni';

COMMIT;
