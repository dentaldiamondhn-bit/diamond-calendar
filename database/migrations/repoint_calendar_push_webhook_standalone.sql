-- Re-point calendar pg_net triggers from the monolith to the standalone
-- (calendario.dentaldiamondhn.com) so invitee notifications on event creation
-- flow through the FCM-capable standalone webhook.
--
-- Both origins served the same webhook code (byte-identical port), but only the
-- standalone has firebase-admin FCM support for native APK push delivery.
-- Bell + web-push still work for both origins.
--
-- ⚠️ CHANGE ME: set _secret to the same PUSH_WEBHOOK_SECRET the standalone
--    deployment uses (must match the env var on Vercel for the standalone).
-- ⚠️ This migration replaces the trigger functions created by
--    20260910a_calendario_push_webhook.sql — only apply ONCE.

CREATE OR REPLACE FUNCTION public.notify_calendar_event_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _base_url  TEXT := 'https://calendario.dentaldiamondhn.com';
  _secret    TEXT := 'CHANGE_ME_PUSH_WEBHOOK_SECRET';
  _resp      BIGINT;
  _cosmetic  BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    _cosmetic := (
      NEW.date IS NOT DISTINCT FROM OLD.date
      AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
      AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
      AND NEW.dentist IS NOT DISTINCT FROM OLD.dentist
      AND NEW.status IS NOT DISTINCT FROM OLD.status
      AND NEW.patient_name IS NOT DISTINCT FROM OLD.patient_name
      AND NEW.title IS NOT DISTINCT FROM OLD.title
    );
    IF _cosmetic THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT net.http_post(
    url     := _base_url || '/api/push/calendar-webhook',
    body    := jsonb_build_object(
      'type',   TG_OP,
      'table',  'events',
      'record', jsonb_build_object(
        'id',           NEW.id,
        'user_id',      NEW.user_id,
        'title',        NEW.title,
        'patient_name', NEW.patient_name,
        'date',         NEW.date,
        'start_time',   NEW.start_time,
        'end_time',     NEW.end_time,
        'dentist',      NEW.dentist,
        'status',       NEW.status,
        'event_type',   NEW.event_type
      ),
      'old', NULL),
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', _secret)
  ) INTO _resp;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_event_push_webhook ON events;
CREATE TRIGGER trg_calendar_event_push_webhook
AFTER INSERT OR UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION public.notify_calendar_event_webhook();

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_calendar_invite_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _base_url  TEXT := 'https://calendario.dentaldiamondhn.com';
  _secret    TEXT := 'CHANGE_ME_PUSH_WEBHOOK_SECRET';
  _resp      BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url     := _base_url || '/api/push/calendar-webhook',
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'event_invitees',
      'record', jsonb_build_object(
        'event_id',   NEW.event_id,
        'user_id',    NEW.user_id,
        'status',     NEW.status,
        'created_by', NEW.created_by
      )),
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', _secret)
  ) INTO _resp;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_invite_push_webhook ON event_invitees;
CREATE TRIGGER trg_calendar_invite_push_webhook
AFTER INSERT ON event_invitees
FOR EACH ROW
EXECUTE FUNCTION public.notify_calendar_invite_webhook();
