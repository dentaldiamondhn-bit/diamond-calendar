import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ownership/membership helpers for event-scoped calendar APIs (Phase 0).
 * Every query here runs on the service-role client after Clerk authz, so the
 * checks are plain ownership comparisons on the canonical `events` family.
 */

/** True when the user owns the event (events.user_id matches). */
export async function isEventOwner(
  db: SupabaseClient,
  eventId: string,
  userId: string
): Promise<boolean> {
  const { data } = await db
    .from('events')
    .select('user_id')
    .eq('id', eventId)
    .maybeSingle();
  return !!data && data.user_id === userId;
}

/** True when the user owns the event or is listed as an invitee. */
export async function isEventMember(
  db: SupabaseClient,
  eventId: string,
  userId: string
): Promise<boolean> {
  if (await isEventOwner(db, eventId, userId)) return true;
  const { data } = await db
    .from('event_invitees')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}