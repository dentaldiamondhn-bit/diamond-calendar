import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const createClient = () => {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'calendar-app-server'
      }
    },
    db: {
      schema: 'public'
    }
  })
}

/**
 * Service-role client for calendar API routes.
 *
 * Identity/authz is enforced in code via Clerk `auth()` (see
 * `src/lib/calendarAuth.ts`); the service role bypasses RLS, and RLS on the
 * live tables then only ever sees non-service-role clients — any direct
 * anon/authenticated access via the public anon key is blocked by the
 * ownership predicates (Migration 20260908_calendario_phase0_security.sql).
 */
export const createServerServiceClient = () => {
  return createSupabaseClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'calendar-app-server-service'
      }
    },
    db: {
      schema: 'public'
    }
  })
}