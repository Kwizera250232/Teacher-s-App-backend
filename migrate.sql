ALTER TABLE schools ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('teacher','student','admin'));
ALTER TABLE homework ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);
ALTER TABLE homework ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS text_response TEXT;
ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS grade INTEGER;
ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP;
CREATE TABLE IF NOT EXISTS admin_announcements (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  target VARCHAR(50) DEFAULT 'all',
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'open',
  admin_reply TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  replied_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_settings (
  id SERIAL PRIMARY KEY,
  platform_name VARCHAR(255) DEFAULT 'EduApp',
  logo_url TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
