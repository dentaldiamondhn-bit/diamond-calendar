-- =====================================================================
-- Migration: user_preferences + favorite_invitees (Nueva cita Step 3)
--
-- Stores per-user (Clerk id) calendar preferences. This feature adds
-- `favorite_invitees` (text[] of Clerk user ids) so the "Nueva cita"
-- invitee picker can pre-select the user's favorited teammates and
-- persist star toggles across reloads.
--
-- Idempotent: safe to re-run. Creates the table when absent and adds
-- the `favorite_invitees` column when missing, without touching other
-- columns used by the existing UserPreferencesService
-- (page_preferences / global_preferences).
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  clerk_user_id TEXT PRIMARY KEY,
  favorite_invitees TEXT[] NOT NULL DEFAULT '{}',
  page_preferences JSONB NOT NULL DEFAULT '{}',
  global_preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS favorite_invitees TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own user preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own user preferences" ON user_preferences;

CREATE POLICY "Users can view own user preferences" ON user_preferences
  FOR SELECT TO authenticated
  USING (clerk_user_id = auth.uid()::text);

CREATE POLICY "Users can insert own user preferences" ON user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (clerk_user_id = auth.uid()::text);

CREATE POLICY "Users can update own user preferences" ON user_preferences
  FOR UPDATE TO authenticated
  USING (clerk_user_id = auth.uid()::text);

GRANT ALL ON user_preferences TO authenticated;

-- =====================================================================
