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
  teacher_answer TEXT,
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

-- CAT Marks (Continuous Assessment Test / Record Students Marks)
CREATE TABLE IF NOT EXISTS cat_marks (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_number INTEGER NOT NULL,
  marks_obtained INTEGER NOT NULL,
  total_marks INTEGER NOT NULL DEFAULT 100,
  test_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(class_id, student_id, test_number)
);
CREATE INDEX IF NOT EXISTS idx_cat_marks_class ON cat_marks(class_id);
CREATE INDEX IF NOT EXISTS idx_cat_marks_student ON cat_marks(student_id);

-- ── Alumni Module ───────────────────────────────────────────────────────────

-- Graduation ceremonies (created by school admin/head teacher)
CREATE TABLE IF NOT EXISTS graduation_ceremonies (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  ceremony_date DATE,
  title VARCHAR(255),
  description TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_graduation_ceremonies_school ON graduation_ceremonies(school_id);
CREATE INDEX IF NOT EXISTS idx_graduation_ceremonies_year ON graduation_ceremonies(year);

-- Alumni profiles (extended info for graduated students)
CREATE TABLE IF NOT EXISTS alumni_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cover_photo_path VARCHAR(500),
  username VARCHAR(50) UNIQUE,
  bio TEXT,
  current_school_or_uni VARCHAR(255),
  graduation_year INTEGER,
  current_location VARCHAR(255),
  skills JSONB DEFAULT '[]',
  interests JSONB DEFAULT '[]',
  languages JSONB DEFAULT '[]',
  social_links JSONB DEFAULT '{}',
  portfolio_links JSONB DEFAULT '[]',
  favorite_subject VARCHAR(100),
  favorite_teacher VARCHAR(100),
  favorite_teacher_reason TEXT,
  favorite_club VARCHAR(100),
  dream_career VARCHAR(255),
  current_occupation VARCHAR(255),
  volunteer_experience TEXT,
  projects JSONB DEFAULT '[]',
  certificates JSONB DEFAULT '[]',
  awards JSONB DEFAULT '[]',
  reading_list JSONB DEFAULT '[]',
  learning_goals TEXT,
  personal_motto VARCHAR(500),
  is_verified BOOLEAN DEFAULT FALSE,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_compositions INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_reads INTEGER DEFAULT 0,
  total_rewards INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_user ON alumni_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_username ON alumni_profiles(username);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_graduation_year ON alumni_profiles(graduation_year);

-- Alumni wallet (for composition rewards)
CREATE TABLE IF NOT EXISTS alumni_wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reward_balance INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  total_paid INTEGER DEFAULT 0,
  pending_rewards INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Alumni wallet transactions
CREATE TABLE IF NOT EXISTS alumni_wallet_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('reward','payout','bonus')),
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  description TEXT,
  paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMP,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  mobile_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON alumni_wallet_transactions(user_id);

-- Alumni compositions (student writing platform - essays/articles)
CREATE TABLE IF NOT EXISTS alumni_compositions (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  featured_image_path VARCHAR(500),
  category VARCHAR(100),
  tags JSONB DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  read_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  bookmarks_count INTEGER DEFAULT 0,
  estimated_read_minutes INTEGER,
  published_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_compositions_author ON alumni_compositions(author_id);
CREATE INDEX IF NOT EXISTS idx_alumni_compositions_status ON alumni_compositions(status);
CREATE INDEX IF NOT EXISTS idx_alumni_compositions_slug ON alumni_compositions(slug);
CREATE INDEX IF NOT EXISTS idx_alumni_compositions_published ON alumni_compositions(published_at);

-- Composition reactions (like, love, celebrate, support)
CREATE TABLE IF NOT EXISTS alumni_composition_reactions (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type VARCHAR(20) NOT NULL CHECK (reaction_type IN ('like','love','celebrate','support')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(composition_id, user_id)
);

-- Article bookmarks
CREATE TABLE IF NOT EXISTS alumni_composition_bookmarks (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(composition_id, user_id)
);

-- Composition comments
CREATE TABLE IF NOT EXISTS alumni_composition_comments (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES alumni_composition_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_composition_comments_composition ON alumni_composition_comments(composition_id);

-- Composition rewards (manual admin rewards for compositions)
CREATE TABLE IF NOT EXISTS alumni_composition_rewards (
  id SERIAL PRIMARY KEY,
  composition_id INTEGER NOT NULL REFERENCES alumni_compositions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  paid_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMP,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  mobile_number VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_composition_rewards_user ON alumni_composition_rewards(user_id);

-- Digital library items
CREATE TABLE IF NOT EXISTS alumni_library_items (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'primary_book','secondary_book','past_paper','revision_note',
    'teacher_resource','university_resource','research_paper',
    'career_guide','government_doc','other'
  )),
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  file_size INTEGER,
  mime_type VARCHAR(100),
  cover_image_path VARCHAR(500),
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grade_level VARCHAR(20),
  subject VARCHAR(100),
  language VARCHAR(50),
  download_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_library_category ON alumni_library_items(category);
CREATE INDEX IF NOT EXISTS idx_library_subject ON alumni_library_items(subject);

-- Library favorites
CREATE TABLE IF NOT EXISTS alumni_library_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES alumni_library_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

-- Opportunities (scholarships, internships, competitions, etc.)
CREATE TABLE IF NOT EXISTS alumni_opportunities (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'scholarship','competition','internship','volunteering',
    'training','bootcamp','hackathon','conference','university_admission',
    'exchange','youth_program','leadership','innovation_challenge','job','other'
  )),
  organization VARCHAR(255),
  location VARCHAR(255),
  country VARCHAR(100),
  province VARCHAR(100),
  district VARCHAR(100),
  education_level VARCHAR(50),
  min_age INTEGER,
  max_age INTEGER,
  deadline DATE,
  application_link VARCHAR(500),
  contact_email VARCHAR(255),
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  view_count INTEGER DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON alumni_opportunities(category);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON alumni_opportunities(deadline);

-- Opportunity favorites / saved
CREATE TABLE IF NOT EXISTS alumni_opportunity_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES alumni_opportunities(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, opportunity_id)
);

-- Alumni follows (networking)
CREATE TABLE IF NOT EXISTS alumni_follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_alumni_follows_follower ON alumni_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_alumni_follows_following ON alumni_follows(following_id);

-- Notifications (alumni-specific)
CREATE TABLE IF NOT EXISTS alumni_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'new_article','new_follower','comment','like','reward',
    'library_update','opportunity','mention','system'
  )),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  related_id INTEGER,
  related_type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alumni_notifications_user ON alumni_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_notifications_read ON alumni_notifications(user_id, is_read);

-- Alumni recognition / awards
CREATE TABLE IF NOT EXISTS alumni_recognitions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  badge_type VARCHAR(50) NOT NULL CHECK (badge_type IN (
    'student_of_month','best_writer','most_helpful','top_mentor',
    'top_reader','top_contributor','top_volunteer','weekly_ranking',
    'monthly_ranking','annual_award','verified_alumni'
  )),
  awarded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  period VARCHAR(20),
  description TEXT,
  awarded_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recognitions_user ON alumni_recognitions(user_id);
CREATE INDEX IF NOT EXISTS idx_recognitions_badge ON alumni_recognitions(badge_type);

-- ── Migration helpers (safe to run on existing DB) ─────────────────────────

-- Add alumni role to users check constraint (handled in auth.js migrations)
-- Add is_alumni + graduation columns to users (if not exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status VARCHAR(20) DEFAULT 'active' CHECK (alumni_status IN ('active','inactive','suspended'));

-- Update role constraint to include alumni (will be handled by auth.js on startup)
