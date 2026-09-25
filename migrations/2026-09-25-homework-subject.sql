-- Add subject column to homework (teacher chooses a subject per homework)
ALTER TABLE homework
ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
