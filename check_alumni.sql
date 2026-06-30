SELECT u.id, u.name, u.role, u.class_id, ap.class_id as alumni_class_id
FROM users u
LEFT JOIN alumni_profiles ap ON ap.user_id=u.id
WHERE u.role='alumni'
LIMIT 10;
