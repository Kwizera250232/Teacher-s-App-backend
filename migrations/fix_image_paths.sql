-- Fix image_paths column to be TEXT[] (array) instead of TEXT
ALTER TABLE alumni_feed_posts ALTER COLUMN image_paths TYPE TEXT[] USING CASE WHEN image_paths IS NULL THEN NULL ELSE ARRAY[image_paths] END;
