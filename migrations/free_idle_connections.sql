-- Show Postgres version
SELECT version();

-- Terminate connections idle for more than 10 minutes (pools reconnect on demand)
SELECT count(pg_terminate_backend(pid)) AS terminated_idle
FROM pg_stat_activity
WHERE state = 'idle'
  AND pid <> pg_backend_pid()
  AND usename NOT IN ('postgres')
  AND state_change < NOW() - INTERVAL '10 minutes';

-- Prevent recurrence: auto-close sessions idle > 15 min (PG14+, no restart needed)
ALTER SYSTEM SET idle_session_timeout = '15min';
SELECT pg_reload_conf();

-- Current connection usage after cleanup
SELECT count(*) AS total_connections FROM pg_stat_activity;
