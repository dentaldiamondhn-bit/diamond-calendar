import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';

/**
 * Batch of event reminders for a set of events (owner or invitee only), each
 * joined with the event fields needed to derive its real fire time
 * (start − minutes_before). Used by the "Recordatorios" side card so reminders
 * configured on citas show up alongside the plain `reminders` rows.
 *
 * NOTE: `id` is not used as a catch-all for `/api/events/[id]/reminders` because
 * Next.js resolves the static segment before the dynamic one.
 */
export async function GET(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return NextResponse.json([]);

  try {
    const supabase = createServerServiceClient();

    const { data: inviteeRows } = await supabase
      .from('event_invitees')
      .select('event_id')
      .eq('user_id', userId)
      .in('event_id', ids);
    const inviteeEventIds = new Set(
      (inviteeRows ?? []).map((r) => Number(r.event_id)).filter(Number.isFinite)
    );

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, user_id, title, patient_name, date, start_time, end_time, status')
      .in('id', ids);
    if (eventsError) throw eventsError;

    const visible = (events ?? []).filter(
      (e) => e.user_id === userId || inviteeEventIds.has(Number(e.id))
    );
    if (visible.length === 0) return NextResponse.json([]);

    const visibleIds = visible.map((e) => Number(e.id));
    const { data: reminderRows, error: remError } = await supabase
      .from('event_reminders')
      .select('id, event_id, minutes_before, sent')
      .in('event_id', visibleIds)
      .order('minutes_before', { ascending: true });
    if (remError) throw remError;

    const byId = new Map(visible.map((e) => [Number(e.id), e]));
    return NextResponse.json(
      (reminderRows ?? []).map((r) => ({
        id: r.id,
        event_id: Number(r.event_id),
        minutes_before: r.minutes_before,
        sent: !!r.sent,
        event: byId.get(Number(r.event_id)) ?? null,
      }))
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}