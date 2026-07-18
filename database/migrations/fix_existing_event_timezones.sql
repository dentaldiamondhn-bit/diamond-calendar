-- Fix existing calendar events/tasks stored with wrong timezone
-- Events were saved with local time (America/Tegucigalpa, UTC-6) WITHOUT timezone offset,
-- so Supabase interpreted them as UTC, making them 6 hours too early.
-- This adds 6 hours to shift them to the correct UTC equivalent.

BEGIN;

UPDATE calendar_events 
SET start_date = start_date + INTERVAL '6 hours',
    end_date   = end_date   + INTERVAL '6 hours'
WHERE start_date IS NOT NULL;

UPDATE calendar_tasks
SET due_date = due_date + INTERVAL '6 hours'
WHERE due_date IS NOT NULL;

UPDATE calendar_reminders
SET reminder_time = reminder_time + INTERVAL '6 hours'
WHERE reminder_time IS NOT NULL;

COMMIT;
