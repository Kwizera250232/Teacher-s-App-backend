-- Fix alumni graduation to preserve class_id
-- First check if class_id exists
SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'class_id';

-- Add class_id to alumni_profiles if not exists
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS class_id INTEGER;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- Update existing alumni profiles to preserve their class data
UPDATE alumni_profiles ap
SET class_id = u.class_id,
    school_id = u.school_id
FROM users u
WHERE ap.user_id = u.id AND u.class_id IS NOT NULL;

-- Ensure alumni can access their old class data
-- The profile/me route should return class_id
