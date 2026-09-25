-- Recorded lessons ("Lesson of the day") with voice summary, written exercises and linked quiz
CREATE TABLE IF NOT EXISTS class_lessons (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  audio_path VARCHAR(500),
  audio_name VARCHAR(255),
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
