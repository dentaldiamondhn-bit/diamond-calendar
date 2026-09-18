import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { calendarAliasIds } from '@/lib/calendarDevBridge';
import { clinicDateKey } from '@/calendario/timezone';

export const runtime = 'nodejs';

export async function GET() {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const supabase = createServerServiceClient();
    const start = clinicDateKey();
    const end = clinicDateKey(new Date(), 14);

    // Visible events = owned OR invited (mirrors the main /api/events read and
    // the `events` RLS predicate, so a doctor's invite lands on the admin's
    // "Próximos Eventos" too).
    const aliasIds = calendarAliasIds(userId);
    const { data: inviteeRows } = await supabase
      .from('event_invitees')
      .select('event_id')
      .in('user_id', aliasIds);
    const inviteeEventIds = (inviteeRows ?? [])
      .map((r) => Number(r.event_id))
      .filter((n) => Number.isFinite(n));

    // Single `or` group: `user_id in (owned) OR id in (invited)`. Chaining
    // `.in()` + `.or()` would AND the branches and hide invitee events.
    const orParts = [`user_id.in.(${aliasIds.join(',')})`];
    if (inviteeEventIds.length > 0) {
      orParts.push(`id.in.(${inviteeEventIds.join(',')})`);
    }

    let query = supabase
      .from('events')
      .select('*')
      .or(orParts.join(','))
      .gte('date', start)
      .lte('date', end)
      .neq('status', 'cancelled');

    const { data: events, error: eventsError } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 400 });
    }

    return NextResponse.json(events || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}