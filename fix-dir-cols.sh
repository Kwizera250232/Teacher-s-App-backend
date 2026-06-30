#!/bin/bash
su - postgres -c "psql -d studentapp_db -c 'ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS total_compositions INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS total_views INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS total_likes INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;'"
pm2 restart studentapi-main --update-env
sleep 2
echo "Done"
