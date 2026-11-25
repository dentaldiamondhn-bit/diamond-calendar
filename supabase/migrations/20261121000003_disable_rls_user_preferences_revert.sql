-- =====================================================================
-- Migration: Disable RLS on user_preferences (revert 20261120000000)
--
-- The user_preferences table is intentionally RLS-free: reads/writes come
-- from the client-side Supabase anon key (via userPreferencesService used by
-- ThemeContext / useUserPreferences) and from server API routes (service
-- role). Re-enabling RLS broke every existing page that persists preferences
-- because auth.uid() is null for the anon client.
--
-- Idempotent: safe to re-run.
-- =====================================================================

ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own user preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own user preferences" ON user_preferences;

GRANT SELECT ON user_preferences TO authenticated;
GRANT INSERT ON user_preferences TO authenticated;
GRANT UPDATE ON user_preferences TO authenticated;
GRANT DELETE ON user_preferences TO authenticated;

GRANT SELECT ON user_preferences TO service_role;
GRANT INSERT ON user_preferences TO service_role;
GRANT UPDATE ON user_preferences TO service_role;
GRANT DELETE ON user_preferences TO service_role;

-- =====================================================================
