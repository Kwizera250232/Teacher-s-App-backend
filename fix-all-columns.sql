ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS cover_photo_path TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS current_location TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS languages TEXT[];
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS social_links TEXT[];
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS portfolio_links TEXT[];
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS favorite_teacher_reason TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS favorite_club TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS volunteer_experience TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS projects TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS certificates TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS awards TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS reading_list TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS learning_goals TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;

ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS published_at TIMESTAMP DEFAULT NOW();
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS bookmarks_count INTEGER DEFAULT 0;
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

SELECT 'All columns added' as status;
