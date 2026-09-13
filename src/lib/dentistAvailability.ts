import type { SupabaseClient } from '@supabase/supabase-js';
import { clerkIdentityOf, getClerkUserIdentities } from '@/lib/clerkUsers';

/** One conflicting dentist booking (server-side availability payload). */
export interface DentistConflict {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  patient_name: string | null;
  title: string | null;
  dentist: string | null;
}

/**
 * Server-side dentist availability (clinic-wide, service role). Any non-finished
 * event whose dentist matches `dentist` and whose window overlaps
 * [start_time, end_time) on `date` conflicts — including events the caller
 * cannot see (the dentist's own private bookings). Cancelled/completed slots are
 * free. `excludeId` skips the event being saved/moved (its own slot).
 */
export async function findDentistConflicts(
  supabase: SupabaseClient,
  dentist: string,
  date: string,
  start_time: string,
  end_time: string,
  excludeId?: number
): Promise<DentistConflict[]> {
  const name = (dentist || '').trim();
  if (!name) return [];

  let query = supabase
    .from('events')
    .select('id, date, start_time, end_time, patient_name, title, dentist')
    .ilike('dentist', name)
    .eq('date', date)
    .lt('start_time', end_time)
    .gt('end_time', start_time)
    .not('status', 'in', '(cancelled,completed)');
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.limit(10);
  if (error) throw error;
  return (data ?? []) as DentistConflict[];
}

/** Shared es-HN warning used by the 409 handlers. */
export function dentistConflictMessage(dentist: string): string {
  return `El odontólogo ${dentist} ya tiene una cita en ese horario.`;
}

/** One conflicting invitee booking (server-side availability payload). */
export interface InviteeConflict extends DentistConflict {
  user_id: string;
  invitee_name: string;
}

/**
 * Server-side invitee availability (clinic-wide, service role). Moving/sizing
 * an event that HAS invitees books every one of those invitees too — so any
 * non-finished event **owned** by an invitee (`user_id IN invitees`) whose
 * window overlaps [start_time, end_time) on `date` conflicts, including events
 * the caller cannot see (the invitee's own private calendar). This is the piece
 * the dentist-name check can't see: B's own appointment fires even when the
 * moved event has no dentist (or a different one). `excludeId` skips the event
 * being saved/moved.
 */
export async function findInviteeConflicts(
  supabase: SupabaseClient,
  inviteeUserIds: string[],
  date: string,
  start_time: string,
  end_time: string,
  excludeId?: number
): Promise<InviteeConflict[]> {
  const ids = [...new Set((inviteeUserIds || []).filter(Boolean))];
  if (ids.length === 0) return [];

  let query = supabase
    .from('events')
    .select('id, user_id, date, start_time, end_time, patient_name, title, dentist')
    .in('user_id', ids)
    .eq('date', date)
    .lt('start_time', end_time)
    .gt('end_time', start_time)
    .not('status', 'in', '(cancelled,completed)');
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.limit(20);
  if (error) throw error;
  const rows = (data ?? []) as Array<
    Pick<InviteeConflict, 'id' | 'user_id' | 'date' | 'start_time' | 'end_time' | 'patient_name' | 'title' | 'dentist'>
  >;
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const clerkUsers = await getClerkUserIdentities(userIds);

  return rows.map((r) => ({
    ...r,
    invitee_name: clerkIdentityOf(clerkUsers, r.user_id).name || 'Invitado',
  }));
}

/** es-HN warning for a blocked save/move that would double-book an invitee. */
export function inviteeConflictMessage(conflicts: InviteeConflict[]): string {
  const c = conflicts[0];
  if (!c) return 'Conflicto de agenda: el invitado ya tiene una cita en ese horario.';
  const who = c.patient_name || c.title || 'otra cita';
  return `Conflicto de agenda: ${c.invitee_name} ya tiene una cita con ${who} (${c.start_time}).`;
}