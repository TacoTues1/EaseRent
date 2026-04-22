-- =============================================================
-- SUPABASE CRON JOBS: Auto-send email reminders & notifications
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- 
-- Prerequisites (do these FIRST in Dashboard > Database > Extensions):
-- 1. Enable pg_cron extension
-- 2. Enable pg_net extension
-- 3. Add CRON_SECRET to your Vercel environment variables
-- =============================================================
-- NOTE: Do NOT create extensions here — enable them via the Dashboard UI.
-- Supabase manages extension privileges automatically.
-- =============================================================

-- =============================================================
-- Step 1: Store secrets in Supabase Vault (secure, not hardcoded)
-- =============================================================
DO $$
BEGIN
    PERFORM vault.create_secret(
        'https://www.abalay-rent.me',
        'site_url'
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'Vault secret "site_url" already exists. Skipping create.';
END
$$;

DO $$
BEGIN
    PERFORM vault.create_secret(
        'abalay_cron_secret_2026_xK9mP4qR7wN2',
        'cron_secret'
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'Vault secret "cron_secret" already exists. Skipping create.';
END
$$;

-- =============================================================
-- Step 2: Remove old cron jobs if they exist (safe to re-run)
-- =============================================================
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('daily-bill-reminders', 'process-scheduled-reminders', 'cleanup-old-reminders');

-- =============================================================
-- CRON JOB 1: Daily Bill Reminders
-- Runs every day at 8:00 AM Philippine Time (PHT = UTC+8, so 00:00 UTC)
-- Handles: Rent bills, WiFi/Water/Electric reminders, contract expiry,
--          late fees, maintenance auto-start
-- =============================================================
SELECT cron.schedule(
    'daily-bill-reminders',
    '0 0 * * *',  -- Every day at 00:00 UTC = 8:00 AM PHT
    $$
    SELECT "net"."http_post"(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'site_url') || '/api/manual-reminders',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{"source": "pg_cron"}'::jsonb,
        timeout_milliseconds := 55000
    ) AS request_id;
    $$
);

-- =============================================================
-- CRON JOB 2: Process Scheduled Reminders Queue
-- Runs every minute to check for due booking/message reminders and maintenance auto-start
-- =============================================================
SELECT cron.schedule(
    'process-scheduled-reminders',
    '* * * * *',  -- Every minute
    $$
    SELECT "net"."http_post"(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'site_url') || '/api/process-scheduled-reminders',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{"source": "pg_cron"}'::jsonb,
        timeout_milliseconds := 25000
    ) AS request_id;
    $$
);

-- =============================================================
-- CRON JOB 3: Cleanup old scheduled_reminders (Weekly)
-- Deletes sent reminders older than 30 days to keep the table clean
-- =============================================================
SELECT cron.schedule(
    'cleanup-old-reminders',
    '0 3 * * 0',  -- Every Sunday at 3:00 AM UTC = 11:00 AM PHT
    $$
    DELETE FROM scheduled_reminders 
    WHERE sent = TRUE 
    AND created_at < NOW() - INTERVAL '30 days';
    $$
);

-- =============================================================
-- VERIFY: Check all registered cron jobs
-- =============================================================
SELECT jobid, jobname, schedule, command 
FROM cron.job 
ORDER BY jobname;
