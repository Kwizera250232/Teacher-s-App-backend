-- Schools
CREATE TABLE IF NOT EXISTS schools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  location VARCHAR(255),
  code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
  is_suspended BOOLEAN DEFAULT FALSE,
  school_id INTEGER REFERENCES schools(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_code VARCHAR(10) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Class Members (students in a class)
CREATE TABLE IF NOT EXISTS class_members (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_class_members_student ON class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_class_members_class ON class_members(class_id);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Homework
CREATE TABLE IF NOT EXISTS homework (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE,
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Homework Submissions
CREATE TABLE IF NOT EXISTS homework_submissions (
  id SERIAL PRIMARY KEY,
  homework_id INTEGER NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  text_response TEXT,
  grade INTEGER,
  feedback TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  graded_at TIMESTAMP,
  UNIQUE(homework_id, student_id)
);

-- Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Quiz Questions
CREATE TABLE IF NOT EXISTS quiz_questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option_a VARCHAR(500) NOT NULL,
  option_b VARCHAR(500) NOT NULL,
  option_c VARCHAR(500),
  option_d VARCHAR(500),
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('a','b','c','d')),
  order_num INTEGER DEFAULT 0
);

-- Quiz Attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  answers JSONB,
  attempted_at TIMESTAMP DEFAULT NOW()
);

-- Announcements (class-level)
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin Announcements (platform-wide)
CREATE TABLE IF NOT EXISTS admin_announcements (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  target VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'teachers', 'students', 'school')),
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reports / Messages
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  admin_reply TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  replied_at TIMESTAMP
);

-- Platform Settings
CREATE TABLE IF NOT EXISTS platform_settings (
  id SERIAL PRIMARY KEY,
  platform_name VARCHAR(255) DEFAULT 'EduApp',
  logo_url VARCHAR(500),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Discussions
CREATE TABLE IF NOT EXISTS discussions (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Textbooks (uploaded by admin for Baza Umunsi Student AI)
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

-- PWA Installations
CREATE TABLE IF NOT EXISTS pwa_installs (
  id SERIAL PRIMARY KEY,
  user_agent TEXT,
  installed_at TIMESTAMP DEFAULT NOW()
);

-- User Profiles (extended info for students & teachers)
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  avatar_path VARCHAR(500),
  phone VARCHAR(30),
  home_address TEXT,
  schools TEXT,            -- JSON array of school names
  dreams TEXT,
  favorite_lessons TEXT,   -- JSON array
  hobbies TEXT,            -- JSON array (min 2)
  fears TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Private Messages (between users in same class or student↔teacher)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_path VARCHAR(500),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Discussion Likes
CREATE TABLE IF NOT EXISTS discussion_likes (
  id SERIAL PRIMARY KEY,
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(discussion_id, user_id)
);

-- Discussion Comments
CREATE TABLE IF NOT EXISTS discussion_comments (
  id SERIAL PRIMARY KEY,
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions (follow system)
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(subscriber_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_target ON subscriptions(target_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions(subscriber_id);

-- Student Shares (lessons, dreams, motivation — visible to subscribers only)
CREATE TABLE IF NOT EXISTS student_shares (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('lesson','dream','motivation')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  visibility VARCHAR(20) NOT NULL DEFAULT 'subscribers' CHECK (visibility IN ('subscribers'))
);
CREATE INDEX IF NOT EXISTS idx_student_shares_type ON student_shares(type);
CREATE INDEX IF NOT EXISTS idx_student_shares_student ON student_shares(student_id);
