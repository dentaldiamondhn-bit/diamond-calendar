-- =====================================================================
-- Migration: user_preferences + appointment_confirmation
--
-- Adds a per-user (Clerk id) boolean preference `appointment_confirmation`
-- to the user_preferences table, persisted from the appointment
-- confirmation toggle in the event preview panel (EventDetailDrawer).
--
-- Idempotent: safe to re-run. Adds the column when missing without
-- touching other columns.
-- =====================================================================

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS appointment_confirmation BOOLEAN NOT NULL DEFAULT false;

-- =====================================================================
