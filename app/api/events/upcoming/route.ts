import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
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
    const { data: inviteeRows } = await supabase
      .from('event_invitees')
      .select('event_id')
      .eq('user_id', userId);
    const inviteeEventIds = (inviteeRows ?? [])
      .map((r) => Number(r.event_id))
      .filter((n) => Number.isFinite(n));

    let query = supabase
      .from('events')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .neq('status', 'cancelled');

    if (inviteeEventIds.length > 0) {
      query = query.or(`user_id.eq.${userId},id.in.(${inviteeEventIds.join(',')})`);
    } else {
      query = query.eq('user_id', userId);
    }

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