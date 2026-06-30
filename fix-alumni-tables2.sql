-- Check what alumni tables exist
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'alumni%' ORDER BY tablename;
