-- Create alumni_profiles for alumni users that don't have one yet
INSERT INTO alumni_profiles (user_id, class_id, school_id, graduation_year, username)
SELECT u.id, u.class_id, u.school_id, u.graduation_year,
       split_part(u.email, '@', 1) || '-' || u.id
FROM users u
WHERE u.role = 'alumni'
  AND NOT EXISTS (SELECT 1 FROM alumni_profiles ap WHERE ap.user_id = u.id);

-- Also create alumni_wallets
INSERT INTO alumni_wallets (user_id)
SELECT u.id FROM users u
WHERE u.role = 'alumni'
  AND NOT EXISTS (SELECT 1 FROM alumni_wallets w WHERE w.user_id = u.id);
