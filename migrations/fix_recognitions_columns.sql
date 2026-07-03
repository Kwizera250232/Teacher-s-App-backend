-- Fix alumni_recognitions to match backend route expectations

-- Rename existing columns
ALTER TABLE alumni_recognitions RENAME COLUMN recipient_id TO user_id;
ALTER TABLE alumni_recognitions RENAME COLUMN badge_icon TO badge_type;
ALTER TABLE alumni_recognitions RENAME COLUMN created_at TO awarded_at;

-- Add missing columns
ALTER TABLE alumni_recognitions ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;
ALTER TABLE alumni_recognitions ADD COLUMN IF NOT EXISTS period VARCHAR(20);

-- Ensure awarded_at has default
ALTER TABLE alumni_recognitions ALTER COLUMN awarded_at SET DEFAULT NOW();
