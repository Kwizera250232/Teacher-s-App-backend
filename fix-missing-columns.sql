-- Fix missing columns in alumni tables
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS author_id INTEGER;
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS reads INTEGER DEFAULT 0;
ALTER TABLE alumni_compositions ADD COLUMN IF NOT EXISTS bookmarks INTEGER DEFAULT 0;

-- If author_id is null, set it from user_id
UPDATE alumni_compositions SET author_id = user_id WHERE author_id IS NULL;

-- Fix alumni_feed columns
ALTER TABLE alumni_feed ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE alumni_feed ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
ALTER TABLE alumni_feed ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0;

-- Fix alumni_profiles columns
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS graduation_year INTEGER;

SELECT 'Columns fixed' as status;
