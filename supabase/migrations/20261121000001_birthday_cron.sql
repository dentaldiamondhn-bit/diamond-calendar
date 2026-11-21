-- Birthday cron: daily staff bell alerts for patients whose birthday is today.
--
-- Primary trigger: Supabase pg_cron at '0 14 * * *' (14:00 UTC = 08:00 America/Tegucigalpa).
-- Secondary fallback: GitHub Actions `.github/workflows/birthday-cron-fallback.yml`
-- at '15 14 * * *' (14:15 UTC = 08:15 Honduras), 15 minutes after pg_cron.
--
-- Both hit POST /api/cron/birthdays, which is idempotent (skips patients who
-- already received a birthday_wish notification today in Tegucigalpa bounds),
-- so the fallback cleanly exits with zero duplicates.
--
-- ⚠️ CHANGE ME before applying:
--   1. Replace '<BASE_URL>' with the production deployment URL (e.g.
--      https://app.dentaldiamondhn.com) that serves /api/cron/birthdays.
--   2. Replace '<CRON_SECRET>' with the same CRON_SECRET env var set on Vercel
--      for the production deployment.
-- ⚠️ pg_cron requires ownership of the `cron` schema. In Supabase this is held
--    by the postgres superuser, NOT the service_role. Run this migration via
--    the Supabase SQL Editor as the postgres user (or grant cron privileges).
--    If `cron.schedule` is not permitted, the migration emits a NOTICE and
--    the GitHub Actions fallback still delivers daily alerts at 08:15 Honduras.
-- ⚠️ pg_cron and pg_net are already installed in this project — no CREATE
--    EXTENSION needed here.
-- ⚠️ Security: the cron secret is inline in the job command. For production,
--    prefer Supabase Vault for scheduled HTTP secrets.
-- Verification:
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'birthday-cron-daily';

DO $$
DECLARE
  _has_cron_priv BOOLEAN := FALSE;
BEGIN
  -- Check whether the current user can read from cron.job (a proxy for cron access).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'cron' AND table_name = 'job'
      AND grantee = current_user
      AND privilege_type = 'SELECT'
  ) INTO _has_cron_priv;

  -- Unschedule any previously created birthday cron (idempotent re-apply).
  IF _has_cron_priv THEN
    BEGIN
      PERFORM cron.unschedule('birthday-cron-daily');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'birthday-cron-daily unschedule skipped (%)', SQLERRM;
    END;
  END IF;

  -- Schedule the daily birthday cron.
  IF _has_cron_priv THEN
    PERFORM cron.schedule(
      'birthday-cron-daily',
      '0 14 * * *',
      $cmd$
      SELECT net.http_post(
        url := '<BASE_URL>/api/cron/birthdays',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', '<CRON_SECRET>'
        )
      );
      $cmd$
    );
    RAISE NOTICE 'birthday-cron-daily scheduled (0 14 * * *)';
  ELSE
    RAISE NOTICE 'birthday-cron-daily NOT scheduled: current user lacks cron schema privileges. GitHub Actions fallback will cover daily alerts.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'birthday-cron-daily scheduling skipped (%); GitHub Actions fallback will cover daily alerts.', SQLERRM;
END $$;
