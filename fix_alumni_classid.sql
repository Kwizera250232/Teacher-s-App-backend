UPDATE alumni_profiles ap
SET class_id = u.class_id
FROM users u
WHERE ap.user_id = u.id
  AND u.role = 'alumni'
  AND (ap.class_id IS NULL)
  AND u.class_id IS NOT NULL;

-- Also update alumni that don't have class_id in users table - get it from class_members
UPDATE users u
SET class_id = cm.class_id
FROM class_members cm
WHERE cm.student_id = u.id
  AND u.role = 'alumni'
  AND u.class_id IS NULL;

-- Now sync alumni_profiles again
UPDATE alumni_profiles ap
SET class_id = u.class_id
FROM users u
WHERE ap.user_id = u.id
  AND u.role = 'alumni'
  AND (ap.class_id IS NULL)
  AND u.class_id IS NOT NULL;
