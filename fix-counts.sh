#!/bin/bash
su - postgres -c "psql -d studentapp_db -c 'ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS compositions_count INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS recognition_count INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0; ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;'"
pm2 restart studentapi-main --update-env
sleep 2
echo "Done"
