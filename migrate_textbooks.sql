-- Migration: Add textbooks table for Baza Umunsi Student AI
CREATE TABLE IF NOT EXISTS textbooks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  grade_level VARCHAR(20) NOT NULL,
  book_type VARCHAR(10) NOT NULL CHECK (book_type IN ('PB', 'TG')),
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI usage logs
CREATE TABLE IF NOT EXISTS ai_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
