-- Add teacher_answer column to homework_submissions
ALTER TABLE homework_submissions
ADD COLUMN IF NOT EXISTS teacher_answer TEXT;
