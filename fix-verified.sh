#!/bin/bash
su - postgres -c "psql -d studentapp_db -c 'ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;'"
pm2 restart studentapi-main --update-env
sleep 2
echo "Done"
